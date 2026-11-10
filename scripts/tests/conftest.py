import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent.parent
ROOT = SCRIPTS_DIR.parent

# transcript_retrieval lives in RAG/ and is imported lazily by the captions fast path.
sys.path.insert(0, str(ROOT / "RAG"))
sys.path.insert(0, str(SCRIPTS_DIR))

# Tests never talk to real providers or Supabase.
for name in ("SUPABASE_URL", "SUPABASE_KEY", "ASSEMBLYAI_KEY"):
    os.environ[name] = ""
