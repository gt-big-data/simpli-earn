#!/usr/bin/env python3
"""Quick test for NVDA video download"""

from pytube import YouTube
import sys

url = "https://www.youtube.com/watch?v=L2pr_J40754"

print("Testing NVDA video access...")
print(f"URL: {url}\n")

try:
    print("1️⃣ Trying to create YouTube object...")
    yt = YouTube(url, use_oauth=False, allow_oauth_cache=False)
    print("✅ YouTube object created")
    
    print("\n2️⃣ Trying to get video title...")
    try:
        title = yt.title
        print(f"✅ Title: {title}")
    except Exception as e:
        print(f"❌ Title failed: {e}")
    
    print("\n3️⃣ Trying to get streams...")
    try:
        streams = yt.streams.filter(only_audio=True)
        print(f"✅ Found {len(streams)} audio streams")
        if streams:
            best = streams.order_by('abr').desc().first()
            print(f"   Best quality: {best.abr if hasattr(best, 'abr') else 'unknown'}")
    except Exception as e:
        print(f"❌ Streams failed: {e}")
    
    print("\n4️⃣ Checking if video is available...")
    try:
        length = yt.length
        print(f"✅ Video length: {length} seconds ({length/60:.1f} minutes)")
    except Exception as e:
        print(f"❌ Length check failed: {e}")
        
    print("\n✅ Basic access works! Video is downloadable.")
    sys.exit(0)
    
except Exception as e:
    print(f"\n❌ Failed to access video: {e}")
    print("\nPossible issues:")
    print("  - Video might be age-restricted")
    print("  - Video might be private/unlisted")  
    print("  - pytube might need updating")
    print("  - YouTube API might have changed")
    sys.exit(1)

