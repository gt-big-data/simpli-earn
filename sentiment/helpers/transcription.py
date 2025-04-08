from google.cloud import speech

def transcribe_audio_with_word_timestamps(gcs_uri, phrases):
    """
    Transcribes an audio file from GCS and returns the full transcript and word-level timestamps.

    Args:
        gcs_uri (str): The Google Cloud Storage URI of the audio file (e.g., gs://bucket/file.mp3).
        phrases (List[str]): List of boosted domain-specific phrases for better recognition.

    Returns:
        transcript_text (str): The full transcript as a string.
        word_timestamps (List[dict]): Each word with its start and end time in seconds.
    """
    client = speech.SpeechClient()

    audio = speech.RecognitionAudio(uri=gcs_uri)

    config = speech.RecognitionConfig(
        encoding=speech.RecognitionConfig.AudioEncoding.MP3,
        sample_rate_hertz=44100,
        language_code="en-US",
        enable_word_time_offsets=True,
        enable_automatic_punctuation=True,
        use_enhanced=True,
        model="video",
        speech_contexts=[
            speech.SpeechContext(
                phrases=phrases,
                boost=15.0
            )
        ]
    )

    operation = client.long_running_recognize(config=config, audio=audio)
    response = operation.result(timeout=1800)  # Adjust timeout if needed

    transcript_text = ""
    word_timestamps = []

    for result in response.results:
        if not result.alternatives:
            continue
        alternative = result.alternatives[0]
        transcript_text += alternative.transcript + " "
        for word_info in alternative.words:
            word_timestamps.append({
                "word": word_info.word,
                "start_time": word_info.start_time.total_seconds(),
                "end_time": word_info.end_time.total_seconds()
            })

    return transcript_text.strip(), word_timestamps
