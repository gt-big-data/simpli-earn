FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn

COPY . .

# Cloud Run will send traffic to $PORT
EXPOSE 8080

ENV PORT=8080

CMD ["sh", "-c", "uvicorn api_chatbot:app --host 0.0.0.0 --port $PORT"]
