import os
import sys
from pathlib import Path

SENTIMENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SENTIMENT_DIR))

for name in ("SUPABASE_URL", "SUPABASE_KEY", "LIBRARY_ADMIN_USER_IDS", "LIBRARY_ADMIN_EMAILS"):
    os.environ[name] = ""
