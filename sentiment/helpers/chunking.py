from pydub import AudioSegment
import os

def split_audio_to_chunks(input_file, output_dir, chunk_length_sec=300, subfolder=None):
    """
    Splits an audio file into fixed-length chunks and saves them to disk.

    Args:
        input_file (str): Path to the input .mp3 file.
        output_dir (str): Directory where chunk folders will be created.
        chunk_length_sec (int): Duration of each chunk in seconds.
        subfolder (str): Optional subfolder under output_dir (e.g., 'tesla').

    Returns:
        List[dict]: List of chunk metadata with filename, path, and timestamps.
    """
    audio = AudioSegment.from_mp3(input_file)
    duration_ms = len(audio)
    chunk_length_ms = chunk_length_sec * 1000

    base_name = os.path.splitext(os.path.basename(input_file))[0]
    chunk_folder = os.path.join(output_dir, subfolder or base_name)
    os.makedirs(chunk_folder, exist_ok=True)

    chunks_metadata = []
    start = 0
    i = 0
    while start < duration_ms:
        end = min(start + chunk_length_ms, duration_ms)
        chunk = audio[start:end]
        chunk_filename = f"{base_name}_chunk_{i:03d}.mp3"
        chunk_path = os.path.join(chunk_folder, chunk_filename)
        chunk.export(chunk_path, format="mp3")

        chunks_metadata.append({
            "filename": chunk_filename,
            "path": chunk_path,
            "start_time": start / 1000,
            "end_time": end / 1000
        })

        start += chunk_length_ms
        i += 1

    return chunks_metadata
