"""
Process Pre-loaded Earnings Calls
==================================
This script processes the 6 pre-loaded earnings call transcripts that already exist locally,
uploads them to Supabase, runs sentiment analysis, and creates database entries.
"""

import os
import sys
from pathlib import Path
from datetime import datetime
import subprocess
from dotenv import load_dotenv
from supabase import create_client

# Add parent directories to path
sys.path.append(str(Path(__file__).parent.parent / "RAG"))
sys.path.append(str(Path(__file__).parent.parent / "sentiment"))

# Load environment variables
env_paths = [
    Path(__file__).parent.parent / "sentiment" / ".env",
    Path(__file__).parent.parent / "RAG" / ".env",
]
for env_path in env_paths:
    if env_path.exists():
        load_dotenv(env_path)
        break

# Pre-loaded call configurations
PRELOADED_CALLS = {
    "1": {
        "video_id": "dC9yOuhiNrk",
        "ticker": "AAPL",
        "title": "Apple Q1 FY25 Earnings Call",
        "transcript_file": "apple_seeking_alpha.txt",
    },
    "2": {
        "video_id": "8K4aHLrekqQ",
        "ticker": "CVS",
        "title": "CVS Health Q3 2024 Earnings Call",
        "transcript_file": "cvs_seeking_alpha.txt",
    },
    "3": {
        "video_id": "URIsVKPmhGg",
        "ticker": "GOOGL",
        "title": "Alphabet Q4 2024 Earnings Call",
        "transcript_file": "alphabet_seeking_alpha.txt",
    },
    "4": {
        "video_id": "fouFNKTDPmk",
        "ticker": "SHEL",
        "title": "Shell Q4 2024 Earnings Call",
        "transcript_file": "shell_seeking_alpha.txt",
    },
    "5": {
        "video_id": "Gub5qCTutZo",
        "ticker": "TSLA",
        "title": "Tesla Q4 2024 Earnings Call",
        "transcript_file": "tesla_seeking_alpha.txt",
    },
    "6": {
        "video_id": "AeznZIbgXhk",
        "ticker": "WMT",
        "title": "Walmart Q4 FY25 Earnings Call",
        "transcript_file": "walmart_seeking_alpha.txt",
    },
}


class PreloadedCallProcessor:
    def __init__(self):
        self.base_dir = Path(__file__).parent.parent
        self.transcripts_dir = self.base_dir / "RAG" / "transcripts"
        self.sentiment_dir = self.base_dir / "sentiment"
        
        # Initialize Supabase
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        
        if not supabase_url or not supabase_key:
            raise ValueError("❌ Missing SUPABASE_URL or SUPABASE_KEY in environment")
        
        self.supabase = create_client(supabase_url, supabase_key)
        print("✅ Supabase connected")
    
    def upload_transcript_to_supabase(self, local_path, video_id, ticker):
        """Upload transcript to Supabase storage"""
        print(f"📤 Uploading transcript for {ticker}...")
        
        try:
            # Read transcript
            with open(local_path, 'r', encoding='utf-8') as f:
                transcript_text = f.read()
            
            # Create filename
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"{ticker.lower()}_{video_id}_{timestamp}_transcript.txt"
            
            # Upload to Supabase
            self.supabase.storage.from_("transcripts").upload(
                path=filename,
                file=transcript_text.encode('utf-8'),
                file_options={"content-type": "text/plain", "upsert": "true"}
            )
            
            print(f"✅ Transcript uploaded: {filename}")
            return filename, transcript_text
            
        except Exception as e:
            print(f"❌ Failed to upload transcript: {e}")
            return None, None
    
    def run_sentiment_analysis(self, transcript_filename, identifier, ticker):
        """Run sentiment analysis using existing scripts"""
        print(f"📊 Running sentiment analysis for {ticker}...")
        
        results = {}
        
        # Run relevance analysis
        print("  → Analyzing relevance...")
        relevance_output_name = f"{identifier}_relevance.csv"
        relevance_script = self.sentiment_dir / "text_insights_relevant.py"
        
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
            result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=600)
            results['relevance_filename'] = relevance_output_name
            print(f"  ✅ Relevance analysis complete")
        except subprocess.TimeoutExpired:
            print(f"  ❌ Relevance analysis timed out")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Relevance analysis failed:")
            print(f"     {e.stderr[:500]}")
        
        # Run specificity analysis
        print("  → Analyzing specificity...")
        specificity_output_name = f"{identifier}_specificity.csv"
        specificity_script = self.sentiment_dir / "text_insights_specific.py"
        
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
            result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=600)
            results['specificity_filename'] = specificity_output_name
            print(f"  ✅ Specificity analysis complete")
        except subprocess.TimeoutExpired:
            print(f"  ❌ Specificity analysis timed out")
        except subprocess.CalledProcessError as e:
            print(f"  ❌ Specificity analysis failed:")
            print(f"     {e.stderr[:500]}")
        
        return results
    
    def create_database_entry(self, video_id, ticker, transcript_filename, sentiment_filenames):
        """Create entry in video_analyses table"""
        print(f"💿 Creating database entry for {ticker}...")
        
        try:
            data = {
                'video_identifier': video_id,
                'transcript_filename': transcript_filename,
                'relevance_filename': sentiment_filenames.get('relevance_filename'),
                'specificity_filename': sentiment_filenames.get('specificity_filename')
            }
            
            # Upsert (insert or update if exists)
            self.supabase.table("video_analyses").upsert(data, on_conflict='video_identifier').execute()
            
            print(f"✅ Database entry created for {ticker}")
            print(f"   📝 Transcript: {transcript_filename}")
            print(f"   📊 Relevance: {sentiment_filenames.get('relevance_filename')}")
            print(f"   📊 Specificity: {sentiment_filenames.get('specificity_filename')}")
            return True
            
        except Exception as e:
            print(f"❌ Failed to create database entry: {e}")
            return False
    
    def process_call(self, dashboard_id, config):
        """Process a single pre-loaded call"""
        print(f"\n{'='*60}")
        print(f"📞 Processing: {config['title']}")
        print(f"{'='*60}")
        print(f"🏷️  Dashboard ID: {dashboard_id}")
        print(f"📹 Video ID: {config['video_id']}")
        print(f"💹 Ticker: {config['ticker']}")
        
        # Check if transcript file exists
        transcript_path = self.transcripts_dir / config['transcript_file']
        if not transcript_path.exists():
            print(f"❌ Transcript file not found: {transcript_path}")
            return False
        
        print(f"📄 Transcript file: {config['transcript_file']}")
        
        # Upload transcript to Supabase
        transcript_filename, transcript_text = self.upload_transcript_to_supabase(
            transcript_path,
            config['video_id'],
            config['ticker']
        )
        
        if not transcript_filename:
            return False
        
        # Create identifier for output files
        identifier = f"{config['ticker'].lower()}_{config['video_id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Run sentiment analysis
        sentiment_filenames = self.run_sentiment_analysis(
            transcript_filename,
            identifier,
            config['ticker']
        )
        
        # Create database entry
        success = self.create_database_entry(
            config['video_id'],
            config['ticker'],
            transcript_filename,
            sentiment_filenames
        )
        
        if success:
            print(f"\n{'='*60}")
            print(f"✅ SUCCESS! {config['ticker']} processed")
            print(f"{'='*60}")
            print(f"🔗 View at: http://localhost:3000/dashboard?id={dashboard_id}")
            print()
            return True
        else:
            print(f"\n{'='*60}")
            print(f"⚠️  Partial Success - Some steps failed for {config['ticker']}")
            print(f"{'='*60}\n")
            return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Process pre-loaded earnings call transcripts",
        epilog="Example: python process_preloaded_calls.py --all"
    )
    parser.add_argument(
        "--id",
        type=str,
        choices=['1', '2', '3', '4', '5', '6'],
        help="Process a specific dashboard ID (1=Apple, 2=CVS, 3=Google, 4=Shell, 5=Tesla, 6=Walmart)"
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process all pre-loaded calls"
    )
    
    args = parser.parse_args()
    
    if not args.id and not args.all:
        parser.print_help()
        print("\n❌ Please specify --id <number> or --all")
        sys.exit(1)
    
    try:
        processor = PreloadedCallProcessor()
        
        if args.all:
            print(f"\n{'='*60}")
            print("🚀 Processing ALL Pre-loaded Calls")
            print(f"{'='*60}")
            print("⏱️  This will take approximately 30-45 minutes")
            print("📊 Each call requires ~5-7 minutes for sentiment analysis")
            print(f"{'='*60}\n")
            
            results = {}
            for dashboard_id, config in PRELOADED_CALLS.items():
                results[dashboard_id] = processor.process_call(dashboard_id, config)
            
            # Summary
            print(f"\n{'='*60}")
            print("📈 PROCESSING SUMMARY")
            print(f"{'='*60}")
            successful = sum(1 for v in results.values() if v)
            failed = len(results) - successful
            print(f"✅ Successful: {successful}/{len(results)}")
            print(f"❌ Failed: {failed}/{len(results)}")
            
            if successful > 0:
                print(f"\n🎉 Successfully processed dashboards:")
                for dashboard_id, success in results.items():
                    if success:
                        config = PRELOADED_CALLS[dashboard_id]
                        print(f"   • Dashboard {dashboard_id}: {config['ticker']} - {config['title']}")
            
            print(f"{'='*60}\n")
        
        else:
            config = PRELOADED_CALLS[args.id]
            processor.process_call(args.id, config)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Process interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()

