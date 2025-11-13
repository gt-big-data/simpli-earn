from pathlib import Path
import argparse
import spacy

"""
sentence_topic.py
-----------------
Splits a transcript text file into sentences using spaCy.

Example usage:
  python sentence_topic.py --file apple_seeking_alpha.txt
"""

# Directory containing transcript text files
TRANSCRIPTS_DIR = Path(__file__).parent / "transcripts"

def split_sentences(path: Path) -> list[str]:
    """Read a transcript file and return a list of individual sentences."""
    text = path.read_text(encoding="utf-8", errors='ignore').strip()

    try:
        # Try using spaCy’s lightweight English model
        nlp = spacy.load("en_core_web_sm")

        # We only need sentence segmentation — disable named entity recognition
        if "ner" in nlp.pipe_names:
            nlp.disable_pipe_names("ner")
    except Exception:
        # If the model isn’t installed, use a simple rule-based sentencizer
            nlp = spacy.blank("en")
            if "sentencizer" not in nlp.pipe_names:
                nlp.add_pipe("sentencizer")
    doc = nlp(text)
    
    # Return non-empty, trimmed sentences
    return [s.text.strip() for s in doc.sents if s.text.strip()]

def main():
    """Command-line entry point for splitting transcript sentences."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", "-f", help="filename in RAG/transcripts (e.g. apple_seeking_alpha.txt)")
    args = parser.parse_args()

    if not TRANSCRIPTS_DIR.exists():
        raise FileNotFoundError(f"Missing folder: {TRANSCRIPTS_DIR}")

    # If user specifies a file, validate it; otherwise, use the first available
    if args.file:
        target = TRANSCRIPTS_DIR / args.file
        if target.suffix == "":
            target = target.with_suffix(".txt")
        if not target.exists():
            available = [p.name for p in sorted(TRANSCRIPTS_DIR.glob("*.txt"))]
            raise FileNotFoundError(f"Not found: {target}\nAvailable: {available}")
    else:
        files = sorted(TRANSCRIPTS_DIR.glob("*.txt"))
        if not files:
            raise FileNotFoundError(f"No .txt files in {TRANSCRIPTS_DIR}")
        target = files[0]

    sents = split_sentences(target)
    print(f"File: {target.name}")
    print(f"Total sentences: {len(sents)}")
    print("First 5 sentences:")
    for s in sents[:5]:
        print("-", s)

if __name__ == "__main__":
    main()