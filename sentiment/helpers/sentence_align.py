import nltk
from nltk.tokenize import sent_tokenize
import re

nltk.download("punkt", quiet=True)

def split_into_sentences(text):
    """
    Cleans and splits the transcript into sentences using NLTK.

    Args:
        text (str): The full transcript text.

    Returns:
        List[str]: List of cleaned sentences.
    """
    # Collapse multiple whitespaces and strip
    text = re.sub(r'\s+', ' ', text).strip()
    return sent_tokenize(text)


def assign_timestamps_to_sentences(sentences, word_timestamps):
    """
    Assigns start and end timestamps to each sentence based on word-level timestamps.

    Args:
        sentences (List[str]): The list of transcript sentences.
        word_timestamps (List[dict]): Each word with 'word', 'start_time', and 'end_time'.

    Returns:
        List[dict]: Each sentence with 'sentence', 'start_time', and 'end_time' fields.
    """
    sentence_timestamps = []
    word_index = 0

    for sentence in sentences:
        words = sentence.split()
        if not words:
            continue

        try:
            start_time = word_timestamps[word_index]["start_time"]
            end_time = word_timestamps[word_index + len(words) - 1]["end_time"]

            # Clamp end_time if it goes beyond available words
            if end_time < start_time:
                end_time = word_timestamps[word_index]["end_time"]

            sentence_timestamps.append({
                "sentence": sentence,
                "start_time": start_time,
                "end_time": end_time
            })

            word_index += len(words)

        except IndexError:
            # Skip sentence if it cannot be matched safely
            sentence_timestamps.append({
                "sentence": sentence,
                "start_time": None,
                "end_time": None
            })

    return sentence_timestamps
