# Build from repository root so we can include scripts/ and sentiment/ for dashboard creation.
# Example: docker build -f RAG/Dockerfile -t simpli-earn-backend .

FROM python:3.11-slim

WORKDIR /app/RAG

COPY RAG/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn

COPY RAG/ .
COPY scripts/create_dashboard_from_youtube.py /app/scripts/create_dashboard_from_youtube.py
COPY sentiment/ /app/sentiment/

EXPOSE 8080

CMD ["uvicorn", "api_chatbot:app", "--host", "0.0.0.0", "--port", "8080"]
