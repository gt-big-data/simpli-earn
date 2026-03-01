from youtube_transcript_api import YouTubeTranscriptApi

def get_video_transcript(video_url):
    """Fetch transcript from a YouTube video URL."""
    video_id = video_url.split("v=")[-1]  # Extract video ID from URL
    try:
        transcript = YouTubeTranscriptApi().fetch(video_id)
        return "\n".join([entry.text for entry in transcript])
    except Exception as e:
        return f"Error: {str(e)}"

def save_transcript_as_txt(transcript, filename="transcript.txt"):
    """Save the transcript as a TXT file."""
    with open(filename, "w", encoding="utf-8") as file:
        file.write(transcript)
    print(f"Transcript saved as {filename}")

# Example usage
# video_url = "https://www.youtube.com/watch?v=Gub5qCTutZo"
# transcript_text = get_video_transcript(video_url)

# if "Error:" not in transcript_text:
#     save_transcript_as_txt(transcript_text, "youtube_transcript.txt")
# else:
#     print(transcript_text)