#!/bin/bash
# Start all SimpliEarn services locally
# Run from project root. Requires venv to be set up.

set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "❌ venv not found. Run: python3 -m venv venv && source venv/bin/activate && pip install -r RAG/requirements.txt && pip install -r sentiment/requirements.txt"
  exit 1
fi

echo "Starting SimpliEarn locally..."
echo ""
echo "Terminal 1: RAG API (8000)"
echo "Terminal 2: Sentiment API (8001)"
echo "Terminal 3: Frontend (3000)"
echo ""
echo "Opening terminals..."

# macOS - open new Terminal tabs
if [[ "$OSTYPE" == "darwin"* ]]; then
  osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"' && source venv/bin/activate && cd RAG && uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000"'
  sleep 1
  osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"' && source venv/bin/activate && cd sentiment && uvicorn api:app --reload --host 0.0.0.0 --port 8001"'
  sleep 1
  osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/frontend && npm run dev"'
  echo ""
  echo "✅ Three Terminal windows opened. Wait for services to start, then open http://localhost:3000"
else
  echo "Run these in 3 separate terminals:"
  echo ""
  echo "  source venv/bin/activate && cd RAG && uvicorn api_chatbot:app --reload --host 0.0.0.0 --port 8000"
  echo "  source venv/bin/activate && cd sentiment && uvicorn api:app --reload --host 0.0.0.0 --port 8001"
  echo "  cd frontend && npm run dev"
fi
