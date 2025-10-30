"""
YouTube to MP3 Download and Transcription Script (using yt-dlp)
This script downloads YouTube videos as MP3 files and transcribes them using AssemblyAI
"""

import os
import yt_dlp
import assemblyai as aai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure AssemblyAI
aai.settings.api_key = os.getenv('ASSEMBLYAI_API_KEY')


def download_youtube_as_mp3(url, output_path="audio_files"):
    """
    Download YouTube video as MP3 audio file using yt-dlp
    
    Args:
        url (str): YouTube video URL
        output_path (str): Directory to save the MP3 file
    
    Returns:
        str: Path to the downloaded MP3 file
    """
    try:
        # Create output directory if it doesn't exist
        if not os.path.exists(output_path):
            os.makedirs(output_path)
        
        print(f"Fetching video: {url}")
        
        # Define output template
        output_template = os.path.join(output_path, '%(title)s.%(ext)s')
        
        # yt-dlp options
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': output_template,
            'quiet': False,
            'no_warnings': False,
        }
        
        # Download and convert to MP3
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            video_title = info.get('title', 'video')
            
            # Construct the expected MP3 filename
            mp3_file = os.path.join(output_path, f"{video_title}.mp3")
            
            print(f"\nSuccessfully downloaded: {mp3_file}")
            return mp3_file
        
    except Exception as e:
        print(f"Error downloading video: {str(e)}")
        return None


def transcribe_audio(audio_file_path, output_path="transcripts"):
    """
    Transcribe audio file using AssemblyAI
    
    Args:
        audio_file_path (str): Path to the audio file
        output_path (str): Directory to save the transcript
    
    Returns:
        str: Path to the transcript file
    """
    try:
        # Create output directory if it doesn't exist
        if not os.path.exists(output_path):
            os.makedirs(output_path)
        
        print(f"\nTranscribing audio file: {audio_file_path}")
        
        # Create transcriber
        transcriber = aai.Transcriber()
        
        # Transcribe the audio file
        print("Uploading and transcribing (this may take a few minutes)...")
        transcript = transcriber.transcribe(audio_file_path)
        
        # Check if transcription was successful
        if transcript.status == aai.TranscriptStatus.error:
            print(f"Transcription failed: {transcript.error}")
            return None
        
        # Create transcript filename
        base_name = os.path.splitext(os.path.basename(audio_file_path))[0]
        transcript_file = os.path.join(output_path, f"{base_name}_transcript.txt")
        
        # Save transcript to file
        with open(transcript_file, 'w', encoding='utf-8') as f:
            f.write(transcript.text)
        
        print(f"\nTranscript saved to: {transcript_file}")
        print(f"\nTranscript preview (first 500 characters):")
        print("-" * 80)
        print(transcript.text[:500])
        if len(transcript.text) > 500:
            print("...")
        print("-" * 80)
        
        return transcript_file
        
    except Exception as e:
        print(f"Error transcribing audio: {str(e)}")
        return None


def main():
    """
    Main function to download YouTube video and transcribe it
    """
    print("=" * 80)
    print("YouTube to MP3 Download and Transcription (yt-dlp)")
    print("=" * 80)
    
    # Get YouTube URL from user
    youtube_url = input("\nEnter YouTube URL: ").strip()
    
    if not youtube_url:
        print("No URL provided. Exiting.")
        return
    
    # Download as MP3
    print("\n" + "=" * 80)
    print("STEP 1: Downloading YouTube Video as MP3")
    print("=" * 80)
    mp3_file = download_youtube_as_mp3(youtube_url)
    
    if not mp3_file:
        print("Failed to download video. Exiting.")
        return
    
    # Transcribe the audio
    print("\n" + "=" * 80)
    print("STEP 2: Transcribing Audio")
    print("=" * 80)
    transcript_file = transcribe_audio(mp3_file)
    
    if transcript_file:
        print("\n" + "=" * 80)
        print("SUCCESS!")
        print("=" * 80)
        print(f"Audio file: {mp3_file}")
        print(f"Transcript file: {transcript_file}")
    else:
        print("\nTranscription failed.")


if __name__ == "__main__":
    main()
