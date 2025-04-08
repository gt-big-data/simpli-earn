from helpers.chunking import split_audio_to_chunks
from helpers.gcs_upload import upload_to_gcs
from helpers.transcription import transcribe_audio_with_word_timestamps
from helpers.sentence_align import split_into_sentences, assign_timestamps_to_sentences
from helpers.sentiment import analyze_sentiment
from helpers.phrases import phrases


import pandas as pd
import os

# Set your GCS bucket name here
BUCKET_NAME = "simpliearn-audio"


def run_pipeline(input_file):
    print("Splitting audio...")
    chunks_metadata = split_audio_to_chunks(input_file, "chunks", chunk_length_sec=300)

    print("Uploading to GCS...")
    for chunk in chunks_metadata:
        path = os.path.join("chunks", chunk["filename"])
        gcs_uri = upload_to_gcs(BUCKET_NAME, path, chunk["filename"])
        chunk["gcs_uri"] = gcs_uri

    print("Transcribing audio...")
    full_transcript = ""
    all_word_timestamps = []

    for chunk in chunks_metadata:
        print(f"→ Transcribing {chunk['filename']}...")
        transcript, word_times = transcribe_audio_with_word_timestamps(chunk["gcs_uri"], phrases)

        # Adjust word timestamps to global timeline
        for word in word_times:
            word["start_time"] += chunk["start_time"]
            word["end_time"] += chunk["start_time"]

        full_transcript += transcript.strip() + " "
        all_word_timestamps.extend(word_times)

    print("Splitting into sentences...")
    sentences = split_into_sentences(full_transcript)
    matched_sentences = assign_timestamps_to_sentences(sentences, all_word_timestamps)

    print("Analyzing sentiment...")
    sentiment_results = analyze_sentiment(matched_sentences)

    print("Saving results...")
    os.makedirs("saved_data", exist_ok=True)
    df = pd.DataFrame(sentiment_results)
    df.to_csv("saved_data/sentiment_analysis.csv", index=False)

    print("Done! Sentiment data saved to saved_data/sentiment_analysis.csv")


if __name__ == "__main__":
    run_pipeline("tesla_q4.mp3")
