#!/usr/bin/env python3
"""
Quick test to verify all dependencies and API keys are working
"""

import os
import sys
from pathlib import Path

# Add parent directories to path
sys.path.append(str(Path(__file__).parent.parent / "RAG"))
sys.path.append(str(Path(__file__).parent.parent / "sentiment"))

def test_imports():
    print("🔍 Testing imports...")
    try:
        import assemblyai as aai
        print("  ✅ assemblyai")
    except ImportError:
        print("  ❌ assemblyai - run: pip install assemblyai")
        return False
        
    try:
        from pytube import YouTube
        print("  ✅ pytube")
    except ImportError:
        print("  ❌ pytube - run: pip install pytube")
        return False
        
    try:
        from supabase import create_client
        print("  ✅ supabase")
    except ImportError:
        print("  ❌ supabase - run: pip install supabase")
        return False
        
    try:
        from dotenv import load_dotenv
        print("  ✅ python-dotenv")
    except ImportError:
        print("  ❌ python-dotenv - run: pip install python-dotenv")
        return False
        
    return True

def test_env_variables():
    print("\n🔍 Testing environment variables...")
    
    from dotenv import load_dotenv
    
    # Load from sentiment/.env
    env_path = Path(__file__).parent.parent / "sentiment" / ".env"
    load_dotenv(env_path)
    
    required_vars = {
        "SUPABASE_URL": os.getenv("SUPABASE_URL"),
        "SUPABASE_KEY": os.getenv("SUPABASE_KEY"),
        "ASSEMBLYAI_KEY": os.getenv("ASSEMBLYAI_KEY"),
    }
    
    all_set = True
    for var, value in required_vars.items():
        if value:
            print(f"  ✅ {var} is set")
        else:
            print(f"  ❌ {var} is missing")
            all_set = False
            
    youtube_key = os.getenv("YOUTUBE_API_KEY")
    if youtube_key:
        print(f"  ✅ YOUTUBE_API_KEY is set (optional)")
    else:
        print(f"  ⚠️  YOUTUBE_API_KEY not set (will use pytube fallback)")
        
    return all_set

def test_supabase_connection():
    print("\n🔍 Testing Supabase connection...")
    
    try:
        from dotenv import load_dotenv
        from supabase import create_client
        
        env_path = Path(__file__).parent.parent / "sentiment" / ".env"
        load_dotenv(env_path)
        
        supabase = create_client(
            os.getenv("SUPABASE_URL"),
            os.getenv("SUPABASE_KEY")
        )
        
        # Try a simple query
        result = supabase.table("video_analyses").select("*").limit(1).execute()
        print(f"  ✅ Connected to Supabase")
        print(f"  ✅ Found {len(result.data)} existing video analyses")
        return True
        
    except Exception as e:
        print(f"  ❌ Supabase connection failed: {e}")
        return False

def test_assemblyai():
    print("\n🔍 Testing AssemblyAI API key...")
    
    try:
        from dotenv import load_dotenv
        import assemblyai as aai
        
        env_path = Path(__file__).parent.parent / "sentiment" / ".env"
        load_dotenv(env_path)
        
        aai.settings.api_key = os.getenv("ASSEMBLYAI_KEY")
        
        # Simple test - just verify the key format
        if aai.settings.api_key and len(aai.settings.api_key) > 10:
            print(f"  ✅ AssemblyAI API key is set")
            print(f"  ℹ️  Key: {aai.settings.api_key[:8]}...")
            return True
        else:
            print(f"  ❌ AssemblyAI API key seems invalid")
            return False
            
    except Exception as e:
        print(f"  ❌ AssemblyAI test failed: {e}")
        return False

def main():
    print("="*60)
    print("SimpliEarn Dashboard Creator - Setup Test")
    print("="*60)
    
    tests = [
        ("Imports", test_imports),
        ("Environment Variables", test_env_variables),
        ("Supabase Connection", test_supabase_connection),
        ("AssemblyAI API", test_assemblyai),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"\n❌ {name} test crashed: {e}")
            results.append((name, False))
    
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {name}")
    
    all_passed = all(result for _, result in results)
    
    if all_passed:
        print("\n🎉 All tests passed! You're ready to create dashboards.")
        print("\nUsage:")
        print("  python scripts/create_dashboard_from_youtube.py '<youtube_url>'")
    else:
        print("\n⚠️  Some tests failed. Please fix the issues above.")
    
    return 0 if all_passed else 1

if __name__ == "__main__":
    sys.exit(main())

