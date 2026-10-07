import os
import sys
from pathlib import Path

RAG_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAG_DIR))

# Tests never talk to real providers or Supabase; keep any local RAG/.env out of the picture.
for name in ("OPENAI_API_KEY", "GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_KEY"):
    os.environ[name] = ""
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
