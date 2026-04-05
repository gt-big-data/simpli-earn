from youtube_transcript_api import YouTubeTranscriptApi


def extract_video_id(video_url):
    """Extract the YouTube video ID from a supported URL."""
    if "v=" in video_url:
        return video_url.split("v=")[-1].split("&")[0]
    if "youtu.be/" in video_url:
        return video_url.split("youtu.be/")[-1].split("?")[0]
    if "youtube.com/live/" in video_url:
        return video_url.split("youtube.com/live/")[-1].split("?")[0]
    return video_url


def get_video_transcript_entries(video_url):
    """Fetch transcript entries including native start times."""
    video_id = extract_video_id(video_url)
    api = YouTubeTranscriptApi()

    if hasattr(api, "fetch"):
        transcript = api.fetch(video_id)
    elif hasattr(YouTubeTranscriptApi, "get_transcript"):
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
    else:
        raise RuntimeError("Unsupported youtube_transcript_api version")

    if hasattr(transcript, "to_raw_data"):
        transcript = transcript.to_raw_data()

    return [
        {
            "text": snippet["text"] if isinstance(snippet, dict) else snippet.text,
            "start": snippet["start"] if isinstance(snippet, dict) else snippet.start,
            "duration": snippet.get("duration") if isinstance(snippet, dict) else snippet.duration,
        }
        for snippet in transcript
    ]


def get_video_transcript(video_url):
    """Fetch transcript from a YouTube video URL."""
    try:
        transcript = get_video_transcript_entries(video_url)
        return "\n".join([entry["text"] for entry in transcript])
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
#
# if "Error:" not in transcript_text:
#     save_transcript_as_txt(transcript_text, "youtube_transcript.txt")
# else:
#     print(transcript_text)
