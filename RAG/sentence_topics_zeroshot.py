from pathlib import Path
import argparse, json, sys
import spacy
from transformers import pipeline

"""
sentence_topics_zeroshot.py
---------------------------
Runs zero-shot topic classification for each sentence in a transcript.

Each sentence is assigned one or more finance-related topics using
a Hugging Face zero-shot classification model (default: BART-Large-MNLI).

Example usage (make sure your in RAG file):
  python sentence_topics_zeroshot.py --file alphabet_seeking_alpha.txt --threshold 0.35

Pre Download Model for speedup:
    pip install huggingface_hub
    huggingface-cli download facebook/bart-large-mnli --local-dir ./models/bart-large-mnli
    python sentence_topics_zeroshot.py --model ./models/bart-large-mnli --file apple_seeking_alpha.txt
"""

TRANSCRIPTS_DIR = Path(__file__).parent / "transcripts"

LABELS = [
  "Revenue/Growth", "Margins/Profitability", "Costs/Expenses",
  "Cash/FCF/CapEx", "Balance Sheet/Leverage", "Capital Returns",
  "Guidance/Outlook", "M&A/Strategy", "Headcount/Restructuring",
  "Risks/Regulatory", "AI/Tech/Infrastructure", "Other/Irrelevant"
]

def load_sentences(txt_path: Path) -> list[str]:
    """Load a transcript and split it into sentences."""
    text = txt_path.read_text(encoding="utf-8", errors="ignore").strip()

    nlp = spacy.blank("en")
    if "sentencizer" not in nlp.pipe_names:
        nlp.add_pipe("sentencizer")

    doc = nlp(text)
    return [s.text.strip() for s in doc.sents if s.text.strip()]

def main():
    """Run zero-shot topic classification over transcript sentences."""

    ap = argparse.ArgumentParser(description="Zero-shot topic classification per sentence")

    ap.add_argument("--file", "-f", required=True, help="filename in RAG/transcripts (e.g. alphabet_seeking_alpha.txt)")
    ap.add_argument("--threshold", type=float, default=0.35, help="multi-label threshold (0..1)")
    ap.add_argument("--model", default="facebook/bart-large-mnli", help="HF model for zero-shot classification")
    ap.add_argument("--batch", type=int, default=16, help="batch size for pipeline")

    args = ap.parse_args()

    target = TRANSCRIPTS_DIR / (args.file if args.file.endswith(".txt") else args.file + ".txt")
    if not target.exists():
        avail = [p.name for p in sorted(TRANSCRIPTS_DIR.glob("*.txt"))]
        raise FileNotFoundError(f"Not found: {target}\nAvailable: {avail}")

    sentences = load_sentences(target)
    if not sentences:
        print("No sentences found.", file=sys.stderr)
        sys.exit(1)

    # Initialize the Hugging Face zero-shot pipeline
    clf = pipeline(
        "zero-shot-classification",
        model=args.model,
        device_map="auto",        # uses GPU if available; CPU otherwise
        truncation=True
    )

    outputs = []

    # Process the transcript in manageable chunks
    for i in range(0, len(sentences), args.batch):
        chunk = sentences[i:i+args.batch]
        res = clf(chunk, LABELS, multi_label=True)

        if isinstance(res, dict):   # single-item edge case
            res = [res]

        for j, r in enumerate(res):
            probs = dict(zip(r["labels"], r["scores"]))

            # Pick all labels above threshold; fallback to top label if none qualify

            picked = [lab for lab, p in probs.items() if p >= args.threshold] or [r["labels"][0]]
            outputs.append({
                "idx": i + j,
                "text": chunk[j],
                "labels": picked,
                "probs": {k: float(v) for k, v in probs.items()}
            })

    # Write JSONL beside the transcript
    out_path = target.with_suffix(".zeroshot.jsonl")
    with out_path.open("w", encoding="utf-8") as f:
        for row in outputs:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Print a quick sample
    print(f"Wrote: {out_path}  (sentences={len(sentences)})")
    for row in outputs[:5]:
        print(f"[{row['idx']:03d}] {row['labels']} :: {row['text'][:120]}")

if __name__ == "__main__":
    main()









