@echo off
REM Start SimpliEarn locally: RAG (:8000) + Sentiment (:8001) + Frontend (:3000).
REM Usage:
REM   start-app.cmd
REM   start-app.cmd --verbose
setlocal
cd /d "%~dp0"

if not exist "venv\Scripts\python.exe" (
  echo venv not found. Run:
  echo   python -m venv venv
  echo   venv\Scripts\activate
  echo   pip install -r RAG\requirements.txt -r sentiment\requirements.txt
  exit /b 1
)

if not exist "node_modules\" (
  echo Installing root launcher deps...
  call npm install
)

if not exist "frontend\node_modules\" (
  echo Installing frontend deps...
  pushd frontend
  call npm install
  popd
)

node scripts\dev-all.mjs %*
