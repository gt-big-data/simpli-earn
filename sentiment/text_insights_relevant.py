#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import csv
import os
import sys
from typing import List, Tuple, Optional
import tempfile
from datetime import datetime
from pathlib import Path

# Load .env file if available
try:
    from dotenv import load_dotenv
    # Try current directory first, then parent directories
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        env_file = parent / '.env'
        if env_file.exists():
            load_dotenv(env_file)
            break
except ImportError:
    pass  # python-dotenv not installed, will rely on environment variables

# --- Supabase Integration ------------------------------------------------------

def get_supabase_client(url: str, key: str):
    """
    Initialize and return a Supabase client.
    """
    try:
        from supabase import create_client, Client
    except ImportError:
        raise ImportError(
            "supabase package not found. Install with: pip install supabase --break-system-packages"
        )
    
    client: Client = create_client(url, key)
    return client


def download_file_from_supabase(
    client,
    bucket_name: str,
    file_path: str,
    local_destination: str
) -> str:
    """
    Download a file from Supabase Storage to local filesystem.
    Returns the local file path.
    """
    try:
        # Download file content as bytes
        data = client.storage.from_(bucket_name).download(file_path)
        
        # Write to local file
        with open(local_destination, 'wb') as f:
            f.write(data)
        
        print(f"✅ Downloaded: {file_path} from bucket '{bucket_name}' to {local_destination}")
        return local_destination
    except Exception as e:
        raise RuntimeError(f"Failed to download file from Supabase: {e}")


def upload_file_to_supabase(
    client,
    bucket_name: str,
    local_file_path: str,
    destination_path: str,
    content_type: str = "text/csv"
) -> str:
    """
    Upload a local file to Supabase Storage.
    Returns the public URL or path.
    """
    try:
        with open(local_file_path, 'rb') as f:
            file_data = f.read()
        
        # Upload file
        response = client.storage.from_(bucket_name).upload(
            path=destination_path,
            file=file_data,
            file_options={"content-type": content_type, "upsert": "true"}
        )
        
        print(f"✅ Uploaded: {local_file_path} to bucket '{bucket_name}' at {destination_path}")
        return destination_path
    except Exception as e:
        raise RuntimeError(f"Failed to upload file to Supabase: {e}")


def insert_record_to_table(
    client,
    table_name: str,
    record: dict
):
    """
    Insert a record into a Supabase table (optional metadata tracking).
    """
    try:
        result = client.table(table_name).insert(record).execute()
        print(f"✅ Inserted record to table '{table_name}'")
        return result
    except Exception as e:
        print(f"⚠️  Warning: Failed to insert record to table: {e}")
        return None


# ---------- Sentence splitting ----------

def split_sentences(text: str) -> List[str]:
    """
    Try spaCy with en_core_web_sm; otherwise fall back to a simple regex splitter.
    """
    text = (text or "").strip()
    if not text:
        return []
    # Try spaCy
    try:
        import spacy
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            return naive_sentence_split(text)
        doc = nlp(text)
        sents = [s.text.strip() for s in doc.sents if s.text.strip()]
        if sents:
            return sents
    except Exception:
        pass
    return naive_sentence_split(text)

def naive_sentence_split(text: str) -> List[str]:
    import re
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]

# ---------- HF inference ----------

def load_classifier(model_name: str, hf_token: Optional[str], device: Optional[int]):
    from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
    if hf_token:
        from huggingface_hub import login
        login(token=hf_token)

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSequenceClassification.from_pretrained(model_name)

    # Auto device detect unless user specified
    if device is None:
        try:
            import torch
            device = 0 if torch.cuda.is_available() else -1
        except Exception:
            device = -1

    clf = pipeline(
        "text-classification",
        model=model,
        tokenizer=tokenizer,
        framework="pt",
        device=device,
        truncation=True
    )
    return clf, model

def run_inference(clf, sentences: List[str], max_length: int = 512, batch_size: int = 32) -> List[dict]:
    results: List[dict] = []
    if not sentences:
        return results
    for i in range(0, len(sentences), batch_size):
        batch = sentences[i:i+batch_size]
        out = clf(batch, truncation=True, max_length=max_length)
        if isinstance(out, dict):
            results.append(out)
        else:
            results.extend(out)
    return results

# ---------- Scoring normalization ----------

def resolve_label_name(raw_label: str, id2label: Optional[dict]) -> Tuple[str, int]:
    numeric_id = None
    readable = raw_label
    if raw_label.startswith("LABEL_"):
        try:
            numeric_id = int(raw_label.split("_", 1)[1])
        except Exception:
            numeric_id = None
    if id2label and numeric_id is not None and numeric_id in id2label:
        readable = id2label[numeric_id]
    return readable, (numeric_id if numeric_id is not None else -1)

def relevance_0_to_1(label_id: int, score: float) -> float:
    """
    Map 3-class label to [0,1]:
      0 -> 0.00..0.33, 1 -> 0.34..0.66, 2 -> 0.67..1.00
    """
    bases = {0: 0.00, 1: 0.34, 2: 0.67}
    base = bases.get(label_id, 0.00)
    width = 0.33
    val = base + score * width
    return max(0.0, min(1.0, val))

def relevance_minus1_to_1(label_id: int, score: float) -> float:
    """
    Alternate mapping to [-1,1]:
      0 -> -1.00..-0.34, 1 -> -0.33..+0.33, 2 -> +0.34..+1.00
    """
    bases = {0: -1.00, 1: -0.33, 2: 0.34}
    base = bases.get(label_id, -1.00)
    width = 0.66
    val = base + score * width
    return max(-1.0, min(1.0, val))

def moving_average(values: List[float], window: int) -> List[Optional[float]]:
    if window <= 1 or not values:
        return [None for _ in values]
    import numpy as np
    v = np.array(values, dtype=float)
    kernel = np.ones(window, dtype=float) / float(window)
    sm = np.convolve(v, kernel, mode="valid").tolist()
    pad = [None] * (window - 1)
    return pad + sm

# ---------- I/O ----------

def read_text_input(transcript_path: Optional[str], stdin_fallback: bool) -> str:
    if transcript_path:
        with open(transcript_path, "r", encoding="utf-8") as f:
            return f.read()
    if stdin_fallback and not sys.stdin.isatty():
        return sys.stdin.read()
    raise ValueError("No transcript provided. Use --input /path/to/file.txt or pipe text with --stdin.")

def write_csv(rows: List[dict], out_path: str):
    fieldnames = [
        "sentence_index",
        "sentence_text",
        "raw_label",
        "label_id",
        "label_name",
        "score",
        "relevance_0_1",
        "relevance_-1_1",
        "ma_relevance_0_1",
    ]
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(
        description="Classify sentence-level relevance and emit a CSV for plotting (with Supabase integration)."
    )
    
    # Input options
    parser.add_argument("--input", "-i", type=str, default=None,
                        help="Path to a local transcript .txt file. If omitted, use --stdin or Supabase.")
    parser.add_argument("--stdin", action="store_true",
                        help="Read transcript text from STDIN when --input is not provided.")
    
    # Supabase options
    parser.add_argument("--supabase-url", type=str, default=os.environ.get("SUPABASE_URL"),
                        help="Supabase project URL (or set SUPABASE_URL env var)")
    parser.add_argument("--supabase-key", type=str, default=os.environ.get("SUPABASE_KEY"),
                        help="Supabase service role key (or set SUPABASE_KEY env var)")
    parser.add_argument("--input-bucket", type=str, default="transcripts",
                        help="Supabase storage bucket name for input files (default: transcripts)")
    parser.add_argument("--input-file", type=str, default=None,
                        help="Path to file in Supabase bucket (e.g., 'folder/transcript.txt')")
    parser.add_argument("--output-bucket", type=str, default="sentiment",
                        help="Supabase storage bucket name for output files (default: sentiment)")
    parser.add_argument("--output-file", type=str, default=None,
                        help="Destination path in Supabase bucket for CSV (e.g., 'folder/result.csv'). If not provided, auto-generated.")
    
    # Output options
    parser.add_argument("--output", "-o", type=str, default="relevance_over_time.csv",
                        help="Local output CSV path (default: relevance_over_time.csv)")
    
    # Model options
    parser.add_argument("--model", type=str, default="gtfintechlab/SubjECTiveQA-RELEVANT",
                        help="Hugging Face model repo id")
    parser.add_argument("--hf-token", type=str, default=os.environ.get("HF_TOKEN"),
                        help="Hugging Face token (env HF_TOKEN or pass here). Not required for public models.")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size (default: 32)")
    parser.add_argument("--max-length", type=int, default=512, help="Max tokens per sentence (default: 512)")
    parser.add_argument("--device", type=int, default=None,
                        help="Transformers pipeline device: -1=CPU, 0=GPU0. Default: auto-detect.")
    parser.add_argument("--ma-window", type=int, default=20,
                        help="Moving average window over relevance_0_1 (default: 20; set 0/1 to disable).")
    
    # Metadata tracking (optional)
    parser.add_argument("--track-metadata", action="store_true",
                        help="Insert processing metadata into a Supabase table (requires 'processing_jobs' table)")
    parser.add_argument("--metadata-table", type=str, default="processing_jobs",
                        help="Table name for metadata tracking (default: processing_jobs)")

    args = parser.parse_args()

    # Validate Supabase usage
    if args.input_file and not (args.supabase_url and args.supabase_key):
        print("❌ Error: --input-file requires Supabase credentials")
        print("   Set environment variables:")
        print("     export SUPABASE_URL='https://xxx.supabase.co'")
        print("     export SUPABASE_KEY='your-service-role-key'")
        print("   Or pass as arguments:")
        print("     --supabase-url 'https://xxx.supabase.co' --supabase-key 'your-key'")
        sys.exit(1)

    # Initialize Supabase client if credentials provided
    supabase_client = None
    use_supabase = args.supabase_url and args.supabase_key
    
    if use_supabase:
        supabase_client = get_supabase_client(args.supabase_url, args.supabase_key)
        print(f"✅ Connected to Supabase")

    # Download input from Supabase if specified
    local_input_path = args.input
    if use_supabase and args.input_file:
        # Create temp file for download
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as tmp:
            temp_input_path = tmp.name
        
        download_file_from_supabase(
            supabase_client,
            args.input_bucket,
            args.input_file,
            temp_input_path
        )
        local_input_path = temp_input_path

    # 1) Read transcript
    text = read_text_input(local_input_path, stdin_fallback=args.stdin)

    # 2) Split into sentences
    print(f"📝 Splitting text into sentences...")
    sentences = split_sentences(text)
    print(f"   Found {len(sentences)} sentences")

    # 3) Load classifier
    print(f"🤖 Loading model: {args.model}")
    clf, model = load_classifier(args.model, args.hf_token, args.device)

    # 4) Inference
    print(f"🔍 Running inference...")
    results = run_inference(clf, sentences, max_length=args.max_length, batch_size=args.batch_size)

    # 5) Label names (if provided by model)
    id2label = None
    try:
        id2label = getattr(model.config, "id2label", None)
        if isinstance(id2label, dict):
            id2label = {int(k): v for k, v in id2label.items()}
    except Exception:
        id2label = None

    # 6) Build CSV rows
    rows = []
    rel01_series = []
    for idx, (sent, res) in enumerate(zip(sentences, results)):
        raw_label = res.get("label", "LABEL_0")
        score = float(res.get("score", 0.0))
        readable, label_id = resolve_label_name(raw_label, id2label)

        r01 = relevance_0_to_1(label_id, score)
        rm1 = relevance_minus1_to_1(label_id, score)
        rel01_series.append(r01)

        rows.append({
            "sentence_index": idx,
            "sentence_text": sent,
            "raw_label": raw_label,
            "label_id": label_id,
            "label_name": readable,
            "score": round(score, 6),
            "relevance_0_1": round(r01, 6),
            "relevance_-1_1": round(rm1, 6),
            "ma_relevance_0_1": None,  # fill after MA
        })

    # 7) Moving average
    window = max(0, int(args.ma_window or 0))
    if window >= 2 and rel01_series:
        print(f"📊 Computing moving average (window={window})...")
        ma = moving_average(rel01_series, window)
        for r, ma_val in zip(rows, ma):
            r["ma_relevance_0_1"] = None if ma_val is None else round(float(ma_val), 6)

    # 8) Write CSV
    write_csv(rows, args.output)
    print(f"✅ Wrote {len(rows)} rows to: {args.output}")

    # Upload to Supabase if enabled
    if use_supabase:
        # Generate output filename if not provided
        output_path = args.output_file
        if not output_path:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            base_name = os.path.splitext(os.path.basename(args.input_file or "transcript"))[0]
            output_path = f"{base_name}_relevance_{timestamp}.csv"
        
        upload_file_to_supabase(
            supabase_client,
            args.output_bucket,
            args.output,
            output_path,
            content_type="text/csv"
        )
        
        # Track metadata if requested
        if args.track_metadata:
            metadata = {
                "input_file": args.input_file,
                "output_file": output_path,
                "model": args.model,
                "sentence_count": len(sentences),
                "processed_at": datetime.now().isoformat(),
                "status": "completed"
            }
            insert_record_to_table(supabase_client, args.metadata_table, metadata)

    # Cleanup temp file if used
    if use_supabase and args.input_file and local_input_path != args.input:
        try:
            os.unlink(local_input_path)
        except Exception:
            pass

    print("\n🎉 Processing complete!")

if __name__ == "__main__":
    main()