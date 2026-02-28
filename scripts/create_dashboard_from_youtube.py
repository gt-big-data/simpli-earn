#!/usr/bin/env python3
"""
Complete pipeline to create a new dashboard entry from a YouTube earnings call.

This script:
1. Downloads YouTube video
2. Transcribes with AssemblyAI
3. Runs sentiment analysis (relevance & specificity)
4. Uploads results to Supabase
5. Creates dashboard entry

Usage:
    python create_dashboard_from_youtube.py <youtube_url>
"""

import os
import sys
import json
import subprocess
from datetime import datetime
from pathlib import Path
import requests
import time

# Add parent directories to path for imports
sys.path.append(str(Path(__file__).parent.parent / "RAG"))
sys.path.append(str(Path(__file__).parent.parent / "sentiment"))

try:
    from supabase import create_client
    import assemblyai as aai
    from pytube import YouTube
except ImportError as e:
    print(f"❌ Missing required package: {e}")
    print("Run: pip install assemblyai pytube supabase")
    sys.exit(1)


class DashboardCreator:
    def __init__(self):
        # Load environment variables
        self.load_env()
        
        # Initialize clients
        self.supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")
        )
        
        aai.settings.api_key = os.getenv("ASSEMBLYAI_KEY")
        
        # Set up directories
        self.base_dir = Path(__file__).parent.parent
        self.temp_dir = self.base_dir / "temp_processing"
        self.temp_dir.mkdir(exist_ok=True)
        
    def load_env(self):
        """Load environment variables from .env files"""
        from dotenv import load_dotenv
        
        # Try to find .env in common locations
        possible_env_locations = [
            Path(__file__).parent.parent / "sentiment" / ".env",
            Path(__file__).parent.parent / "RAG" / ".env",
            Path(__file__).parent.parent / ".env",
        ]
        
        for env_path in possible_env_locations:
            if env_path.exists():
                load_dotenv(env_path)
                
    def extract_video_id(self, url):
        """Extract YouTube video ID from URL"""
        if "v=" in url:
            return url.split("v=")[1].split("&")[0]
        elif "youtu.be/" in url:
            return url.split("youtu.be/")[1].split("?")[0]
        elif "youtube.com/live/" in url:
            return url.split("youtube.com/live/")[1].split("?")[0]
        return None
        
    def get_youtube_metadata(self, video_id):
        """Get video metadata from YouTube Data API"""
        api_key = os.getenv("YOUTUBE_API_KEY")
        if not api_key:
            # Fallback to yt-dlp
            return self.get_metadata_ytdlp(f"https://www.youtube.com/watch?v={video_id}")
            
        url = f'https://www.googleapis.com/youtube/v3/videos?id={video_id}&part=snippet&key={api_key}'
        
        try:
            response = requests.get(url, timeout=10)
            data = response.json()
            
            if 'items' in data and len(data['items']) > 0:
                snippet = data['items'][0]['snippet']
                return {
                    'title': snippet['title'],
                    'upload_date': snippet['publishedAt'],
                    'description': snippet.get('description', '')
                }
        except Exception as e:
            print(f"⚠️  YouTube API failed: {e}, trying pytube...")
            
            return self.get_metadata_ytdlp(f"https://www.youtube.com/watch?v={video_id}")
        
    def get_metadata_ytdlp(self, url):
        """Get metadata using yt-dlp (more reliable)"""
        try:
            import subprocess
            import json
            
            result = subprocess.run([
                'yt-dlp',
                '--dump-json',
                '--no-download',
                url
            ], capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                data = json.loads(result.stdout)
                return {
                    'title': data.get('title', 'Unknown'),
                    'upload_date': data.get('upload_date', datetime.now().strftime('%Y%m%d')),
                    'description': data.get('description', '')
                }
        except Exception as e:
            print(f"⚠️  yt-dlp metadata failed: {e}")
        
        # Fallback to pytube
        try:
            from pytube import YouTube
            yt = YouTube(url, use_oauth=False, allow_oauth_cache=False)
            return {
                'title': yt.title,
                'upload_date': yt.publish_date.isoformat() if yt.publish_date else datetime.now().isoformat(),
                'description': yt.description or ''
            }
        except Exception as e:
            print(f"⚠️  pytube metadata also failed: {e}")
            return None
            
    def guess_ticker_from_title(self, title):
        """Extract ticker symbol from video title"""
        import re
        
        # Common patterns
        patterns = [
            r'\(([A-Z]{1,5})\)',  # (AAPL)
            r'\b([A-Z]{1,5})\s+Q[1-4]',  # AAPL Q1
            r'^([A-Z]{1,5})\s',  # AAPL at start
        ]
        
        for pattern in patterns:
            match = re.search(pattern, title)
            if match:
                return match.group(1)
                
        # Company name mapping
        company_tickers = {
            'Apple': 'AAPL',
            'Google': 'GOOGL',
            'Alphabet': 'GOOGL',
            'Tesla': 'TSLA',
            'Microsoft': 'MSFT',
            'Amazon': 'AMZN',
            'Meta': 'META',
            'Facebook': 'META',
            'Walmart': 'WMT',
            'CVS': 'CVS',
            'Shell': 'SHEL',
        }
        
        for company, ticker in company_tickers.items():
            if company.lower() in title.lower():
                return ticker
                
        return "UNKNOWN"
        
    def download_audio(self, youtube_url):
        """Download audio from YouTube video using yt-dlp (more reliable)"""
        print("🎵 Downloading audio from YouTube...")
        
        # Primary method: yt-dlp downloading best audio format directly (no ffmpeg needed)
        try:
            import subprocess
            output_file = self.temp_dir / f"audio_{int(time.time())}.m4a"
            
            print("  → Using yt-dlp (downloading audio-only format)...")
            result = subprocess.run([
                'yt-dlp',
                '-f', 'bestaudio',  # Download best audio stream directly (no conversion)
                '-o', str(output_file),
                youtube_url
            ], capture_output=True, text=True, timeout=600)
            
            if result.returncode == 0 and output_file.exists():
                print(f"✅ Audio downloaded: {output_file}")
                return output_file
            else:
                print(f"⚠️  yt-dlp download failed")
                if result.stderr:
                    print(f"   Error: {result.stderr[:200]}")
                
        except Exception as e:
            print(f"⚠️  yt-dlp failed: {e}")
        
        # Fallback: pytube
        try:
            print("  → Trying pytube as fallback...")
            from pytube import YouTube
            yt = YouTube(youtube_url, use_oauth=False, allow_oauth_cache=False)
            
            # Get audio stream
            audio_stream = yt.streams.filter(only_audio=True).order_by('abr').desc().first()
            
            if not audio_stream:
                audio_stream = yt.streams.filter(file_extension='mp4').first()
            
            if not audio_stream:
                raise Exception("No audio stream found")
                
            output_file = self.temp_dir / f"audio_{int(time.time())}.mp4"
            audio_stream.download(output_path=str(self.temp_dir), filename=output_file.name)
            
            print(f"✅ Audio downloaded via pytube: {output_file}")
            return output_file
            
        except Exception as e:
            print(f"❌ pytube also failed: {e}")
            return None
            
    def transcribe_with_assemblyai(self, audio_file):
        """Transcribe audio using AssemblyAI"""
        print("🎤 Transcribing with AssemblyAI...")
        
        try:
            transcriber = aai.Transcriber()
            transcript = transcriber.transcribe(str(audio_file))
            
            if transcript.status == aai.TranscriptStatus.error:
                raise Exception(f"Transcription failed: {transcript.error}")
                
            print(f"✅ Transcription complete ({len(transcript.text)} characters)")
            return transcript.text
            
        except Exception as e:
            print(f"❌ Transcription failed: {e}")
            return None
            
    def save_transcript(self, transcript_text, identifier):
        """Save transcript to Supabase storage"""
        print("💾 Saving transcript to Supabase...")
        
        try:
            filename = f"{identifier}_transcript.txt"
            
            # Upload to transcripts bucket
            self.supabase.storage.from_("transcripts").upload(
                filename,
                transcript_text.encode('utf-8'),
                {"content-type": "text/plain"}
            )
            
            print(f"✅ Transcript saved: {filename}")
            return filename
            
        except Exception as e:
            print(f"❌ Failed to save transcript: {e}")
            return None
            
    def run_sentiment_analysis(self, transcript_filename, identifier):
        """Run both relevance and specificity sentiment analysis using Supabase"""
        print("📊 Running sentiment analysis...")
        
        results = {}
        
        # Run relevance analysis directly on Supabase
        print("  → Analyzing relevance...")
        relevance_output_name = f"{identifier}_relevance.csv"
        relevance_script = self.base_dir / "sentiment" / "text_insights_relevant.py"
        
        hf_token = os.getenv("HF_TOKEN")
        cmd = [
            sys.executable,
            str(relevance_script),
            "--input-file", transcript_filename,
            "--output-file", relevance_output_name,
            "--output-bucket", "sentiment",
            "--supabase-url", os.getenv("SUPABASE_URL"),
            "--supabase-key", os.getenv("SUPABASE_KEY"),
        ]
        if hf_token:
            cmd.extend(["--hf-token", hf_token])
        
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            results['relevance_filename'] = relevance_output_name
            print(f"  ✅ Relevance analysis complete")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Relevance analysis failed:")
            print(f"     {e.stderr}")
            
        # Run specificity analysis
        print("  → Analyzing specificity...")
        specificity_output_name = f"{identifier}_specificity.csv"
        specificity_script = self.base_dir / "sentiment" / "text_insights_specific.py"
        
        hf_token = os.getenv("HF_TOKEN")
        cmd = [
            sys.executable,
            str(specificity_script),
            "--input-file", transcript_filename,
            "--output-file", specificity_output_name,
            "--output-bucket", "sentiment",
            "--supabase-url", os.getenv("SUPABASE_URL"),
            "--supabase-key", os.getenv("SUPABASE_KEY"),
        ]
        if hf_token:
            cmd.extend(["--hf-token", hf_token])
        
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            results['specificity_filename'] = specificity_output_name
            print(f"  ✅ Specificity analysis complete")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Specificity analysis failed:")
            print(f"     {e.stderr}")
            
        return results
        
    # Removed upload_sentiment_results - now done directly by analysis scripts
        
    def create_database_entry(self, video_identifier, metadata, transcript_filename, sentiment_filenames):
        """Create entry in video_analyses table"""
        print("💿 Creating database entry...")
        
        try:
            # Start with minimal required fields
            data = {
                'video_identifier': video_identifier,
                'transcript_filename': transcript_filename,
                'relevance_filename': sentiment_filenames.get('relevance_filename'),
                'specificity_filename': sentiment_filenames.get('specificity_filename')
            }
            
            # Upsert (insert or update if exists) - specify the unique column
            result = self.supabase.table("video_analyses").upsert(data, on_conflict='video_identifier').execute()
            
            print(f"✅ Database entry created for: {video_identifier}")
            print(f"   📝 Transcript: {transcript_filename}")
            print(f"   📊 Relevance: {sentiment_filenames.get('relevance_filename')}")
            print(f"   📊 Specificity: {sentiment_filenames.get('specificity_filename')}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to create database entry: {e}")
            return False
            
    def cleanup(self):
        """Clean up temporary files"""
        print("🧹 Cleaning up temporary files...")
        
        try:
            for file in self.temp_dir.glob("*"):
                file.unlink()
            print("✅ Cleanup complete")
        except Exception as e:
            print(f"⚠️  Cleanup warning: {e}")
            
    def process_youtube_video(self, youtube_url, ticker_override=None):
        """Complete pipeline to process a YouTube video"""
        print(f"\n{'='*60}")
        print(f"🚀 Starting Dashboard Creation Pipeline")
        print(f"{'='*60}\n")
        
        # Extract video ID
        video_id = self.extract_video_id(youtube_url)
        if not video_id:
            print("❌ Could not extract video ID from URL")
            return False
            
        print(f"📹 Video ID: {video_id}")
        
        # Get metadata (optional - continue even if fails)
        metadata = self.get_youtube_metadata(video_id)
        if not metadata:
            print("⚠️  Could not retrieve video metadata, using defaults")
            metadata = {
                'title': f"Earnings Call {video_id}",
                'upload_date': datetime.now().isoformat(),
                'description': ''
            }
        else:
            print(f"📋 Title: {metadata['title']}")
            print(f"📅 Date: {metadata['upload_date']}")
        
        # Use provided ticker or detect from title
        if ticker_override:
            ticker = ticker_override.upper()
            print(f"💹 Ticker: {ticker} (provided by user)")
        else:
            ticker = self.guess_ticker_from_title(metadata['title'])
            print(f"💹 Ticker: {ticker} (auto-detected)")
            if ticker == "UNKNOWN":
                print("⚠️  Warning: Could not detect ticker. Stock charts may not work.")
        
        metadata['ticker'] = ticker
        
        # Create identifier
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        identifier = f"{ticker.lower()}_{video_id}_{timestamp}"
        
        # Download audio
        audio_file = self.download_audio(youtube_url)
        if not audio_file:
            return False
            
        # Transcribe with AssemblyAI
        transcript_text = self.transcribe_with_assemblyai(audio_file)
        if not transcript_text:
            self.cleanup()
            return False
            
        # Save transcript
        transcript_filename = self.save_transcript(transcript_text, identifier)
        if not transcript_filename:
            self.cleanup()
            return False
            
        # Run sentiment analysis (uploads directly to Supabase)
        sentiment_filenames = self.run_sentiment_analysis(transcript_filename, identifier)
        
        # Create database entry
        success = self.create_database_entry(
            video_identifier=video_id,
            metadata=metadata,
            transcript_filename=transcript_filename,
            sentiment_filenames=sentiment_filenames
        )
        
        # Cleanup
        self.cleanup()
        
        if success:
            print(f"\n{'='*60}")
            print(f"✅ SUCCESS! Dashboard entry created")
            print(f"{'='*60}")
            print(f"\n📊 View at: http://localhost:3000/dashboard?video_url={youtube_url}")
            print(f"🆔 Video Identifier: {video_id}\n")
            return True
        else:
            print(f"\n{'='*60}")
            print(f"⚠️  Partial Success - Some steps failed")
            print(f"{'='*60}\n")
            return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Create a dashboard from a YouTube earnings call",
        epilog="Example: python create_dashboard_from_youtube.py 'https://youtube.com/watch?v=...' --ticker AAPL"
    )
    parser.add_argument("youtube_url", help="YouTube video URL")
    parser.add_argument(
        "--ticker", "-t",
        help="Stock ticker symbol (e.g., AAPL, TSLA). If not provided, will attempt to detect from video title.",
        default=None
    )
    
    args = parser.parse_args()
    
    # Validate URL
    if "youtube.com" not in args.youtube_url and "youtu.be" not in args.youtube_url:
        print("❌ Invalid YouTube URL")
        sys.exit(1)
        
    creator = DashboardCreator()
    success = creator.process_youtube_video(args.youtube_url, args.ticker)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

