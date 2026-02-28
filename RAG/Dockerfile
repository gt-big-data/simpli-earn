FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt fastapi uvicorn

COPY . .

# Cloud Run will send traffic to port 8080
EXPOSE 8080

CMD ["uvicorn", "api_chatbot:app", "--host", "0.0.0.0", "--port", "8080"]
