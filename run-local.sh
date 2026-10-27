#!/bin/bash
# Start all SimpliEarn services locally (Mac/Linux helper).
# Prefer the cross-platform launcher: npm run dev
# Run from project root. Requires ./venv and root + frontend npm installs.

set -e
cd "$(dirname "$0")"

if [ ! -d "venv" ]; then
  echo "❌ venv not found. Run: python3 -m venv venv && source venv/bin/activate && pip install -r RAG/requirements.txt && pip install -r sentiment/requirements.txt"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing root launcher deps..."
  npm install
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing frontend deps..."
  (cd frontend && npm install)
fi

echo "Starting via npm run dev (RAG :8000, Sentiment :8001, Frontend :3000)..."
exec npm run dev
