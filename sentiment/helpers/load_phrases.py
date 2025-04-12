import os

def load_phrases_from_file(filename):
    """
    Loads a list of phrases from a plain text file (one phrase per line).

    Args:
        filename (str): Path to the .txt file.

    Returns:
        List[str]: A list of phrases to boost during transcription.
    """
    if not os.path.exists(filename):
        print(f"[INFO] Phrase file not found: {filename}. Using empty phrase list.")
        return []

    with open(filename, "r", encoding="utf-8") as f:
        phrases = [line.strip() for line in f if line.strip()]

    return phrases
