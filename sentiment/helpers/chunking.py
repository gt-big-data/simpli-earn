from pydub import AudioSegment
import os

def split_audio_to_chunks(input_file, output_dir, chunk_length_sec=300):
    """
    Splits a long MP3 file into smaller chunks of specified length (in seconds).

    Args:
        input_file (str): Path to the input MP3 file.
        output_dir (str): Directory where chunked MP3 files will be saved.
        chunk_length_sec (int): Length of each chunk in seconds (default: 300s / 5 min).

    Returns:
        List[Dict]: Metadata for each chunk with filename, start_time, and end_time.
    """
    audio = AudioSegment.from_mp3(input_file)
    duration_ms = len(audio)
    chunk_length_ms = chunk_length_sec * 1000

    os.makedirs(output_dir, exist_ok=True)
    chunks_metadata = []

    start = 0
    i = 0
    while start < duration_ms:
        end = min(start + chunk_length_ms, duration_ms)
        chunk = audio[start:end]
        start_time = start / 1000
        end_time = end / 1000
        chunk_name = f"chunk_{i:03d}.mp3"
        chunk_path = os.path.join(output_dir, chunk_name)
        chunk.export(chunk_path, format="mp3")

        chunks_metadata.append({
            "filename": chunk_name,
            "start_time": start_time,
            "end_time": end_time
        })

        start += chunk_length_ms
        i += 1

    return chunks_metadata
