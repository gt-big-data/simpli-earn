# Sentiment Analysis API Documentation

A FastAPI backend for running sentiment analysis (specificity and relevance) on transcripts stored in Supabase.

## Features

- ✅ Run specificity analysis on transcripts
- ✅ Run relevance analysis on transcripts
- ✅ Background job processing with status tracking
- ✅ List transcripts and results from Supabase
- ✅ Download result files as CSV
- ✅ Get result data as JSON for frontend visualization
- ✅ CORS enabled for frontend integration
- ✅ Automatic .env loading

## Setup

### 1. Install Dependencies

```bash
pip install -r requirements_api.txt --break-system-packages
```

Or in a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements_api.txt
```

### 2. Environment Variables

Make sure your `.env` file contains:
```
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_KEY=your-service-role-key
HF_TOKEN=your-huggingface-token  # Optional
```

### 3. Required Files

Make sure these scripts are in the same directory as `api.py`:
- `text_insights_specific.py` (specificity analysis script)
- `text_insights_relevant.py` (relevance analysis script)

## Running the API

### Development Mode
```bash
python api.py
```

Or with uvicorn directly:
```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

### Production Mode
```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --workers 4
```

The API will be available at: `http://localhost:8000`

## API Endpoints

### Health Check
```
GET /
```
Returns API status and Supabase connection status.

**Response:**
```json
{
  "status": "ok",
  "service": "Sentiment Analysis API",
  "version": "1.0.0",
  "supabase_connected": true
}
```

---

### Run Specificity Analysis
```
POST /analyze/specificity
```

**Request Body:**
```json
{
  "input_file": "q4_transcript.txt",
  "output_file": "q4_transcript_specific.csv",  // optional
  "batch_size": 32,  // optional, default: 32
  "ma_window": 20,   // optional, default: 20
  "track_metadata": false  // optional, default: false
}
```

**Response:**
```json
{
  "job_id": "job_20241026_143052_123456",
  "status": "pending",
  "message": "Specificity analysis started",
  "output_file": "q4_transcript_specific.csv"
}
```

---

### Run Relevance Analysis
```
POST /analyze/relevance
```

**Request Body:** Same as specificity

**Response:** Same as specificity

---

### Get Job Status
```
GET /jobs/{job_id}
```

**Response:**
```json
{
  "job_id": "job_20241026_143052_123456",
  "status": "completed",  // pending, running, completed, failed
  "analysis_type": "specificity",
  "input_file": "q4_transcript.txt",
  "output_file": "q4_transcript_specific.csv",
  "created_at": "2024-10-26T14:30:52.123456",
  "completed_at": "2024-10-26T14:31:15.789012",
  "error": null
}
```

---

### List All Jobs
```
GET /jobs
```

Returns array of all job statuses.

---

### List Transcripts
```
GET /transcripts
```

**Response:**
```json
[
  {
    "name": "q4_transcript.txt",
    "size": 45678,
    "created_at": "2024-10-26T10:00:00",
    "updated_at": "2024-10-26T10:00:00"
  }
]
```

---

### List Results
```
GET /sentiment
```

Returns list of all CSV files in the sentiment bucket.

**Response:** Same format as `/transcripts`

---

### Download Result File
```
GET /sentiment/{filename}
```

Downloads the CSV file.

**Example:**
```bash
curl http://localhost:8000/sentiment/q4_transcript_specific.csv -o result.csv
```

---

### Get Result Data as JSON
```
GET /sentiment/{filename}/data
```

Returns the CSV data parsed as JSON for frontend visualization.

**Response:**
```json
{
  "filename": "q4_transcript_specific.csv",
  "total_sentences": 150,
  "data": [
    {
      "sentence_index": 0,
      "sentence_text": "Welcome to our Q4 earnings call.",
      "raw_label": "LABEL_1",
      "label_id": 1,
      "label_name": "Somewhat Specific",
      "score": 0.89,
      "specificity_0_1": 0.63,
      "specificity_-1_1": 0.26,
      "ma_specificity_0_1": null
    },
    // ... more sentences
  ]
}
```

---

### Delete Result File
```
DELETE /sentiment/{filename}
```

Deletes a file from the sentiment bucket.

**Response:**
```json
{
  "message": "Deleted q4_transcript_specific.csv"
}
```

## Usage Examples

### Using cURL

**Start specificity analysis:**
```bash
curl -X POST http://localhost:8000/analyze/specificity \
  -H "Content-Type: application/json" \
  -d '{
    "input_file": "q4_transcript.txt",
    "output_file": "q4_specific.csv"
  }'
```

**Check job status:**
```bash
curl http://localhost:8000/jobs/job_20241026_143052_123456
```

**Get result data:**
```bash
curl http://localhost:8000/sentiment/q4_specific.csv/data
```

### Using Python

```python
import requests

# Start analysis
response = requests.post(
    "http://localhost:8000/analyze/specificity",
    json={
        "input_file": "q4_transcript.txt",
        "output_file": "q4_specific.csv"
    }
)
job = response.json()
print(f"Job ID: {job['job_id']}")

# Check status
import time
while True:
    status = requests.get(f"http://localhost:8000/jobs/{job['job_id']}").json()
    print(f"Status: {status['status']}")
    
    if status['status'] in ['completed', 'failed']:
        break
    
    time.sleep(2)

# Get results
if status['status'] == 'completed':
    results = requests.get(
        f"http://localhost:8000/sentiment/{status['output_file']}/data"
    ).json()
    print(f"Total sentences: {results['total_sentences']}")
```

### Using JavaScript/Fetch

```javascript
// Start analysis
const response = await fetch('http://localhost:8000/analyze/specificity', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    input_file: 'q4_transcript.txt',
    output_file: 'q4_specific.csv'
  })
});

const job = await response.json();
console.log('Job ID:', job.job_id);

// Poll for status
const checkStatus = async (jobId) => {
  const statusResponse = await fetch(`http://localhost:8000/jobs/${jobId}`);
  const status = await statusResponse.json();
  
  if (status.status === 'completed') {
    // Get results
    const resultsResponse = await fetch(
      `http://localhost:8000/sentiment/${status.output_file}/data`
    );
    const results = await resultsResponse.json();
    console.log('Results:', results);
  } else if (status.status === 'failed') {
    console.error('Job failed:', status.error);
  } else {
    // Still running, check again in 2 seconds
    setTimeout(() => checkStatus(jobId), 2000);
  }
};

checkStatus(job.job_id);
```

## Interactive API Documentation

FastAPI automatically generates interactive documentation:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

You can test all endpoints directly from the browser!

## Error Handling

The API returns standard HTTP status codes:

- `200` - Success
- `404` - Resource not found (job, file, etc.)
- `500` - Server error (Supabase connection issues, script errors, etc.)

Error responses include details:
```json
{
  "detail": "Job not found"
}
```

## Background Processing

Analysis jobs run in the background, so the API responds immediately with a job ID. You can:

1. Poll the job status endpoint
2. Use webhooks (future enhancement)
3. Use WebSockets for real-time updates (future enhancement)

## File Organization

The API expects this structure:
```
your-project/
├── api.py
├── text_insights_specific.py
├── text_insights_relevant.py
├── requirements_api.txt
└── .env (in parent directory)
```

## Deployment

### Using Docker (Recommended for Production)

Create a `Dockerfile`:
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements_api.txt .
RUN pip install -r requirements_api.txt

COPY api.py .
COPY text_insights_specific.py .
COPY text_insights_relevant.py .

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

Build and run:
```bash
docker build -t sentiment-api .
docker run -p 8000:8000 --env-file .env sentiment-api
```

### Using systemd (Linux)

Create `/etc/systemd/system/sentiment-api.service`:
```ini
[Unit]
Description=Sentiment Analysis API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/your/app
Environment="PATH=/path/to/venv/bin"
EnvironmentFile=/path/to/.env
ExecStart=/path/to/venv/bin/uvicorn api:app --host 0.0.0.0 --port 8000

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable sentiment-api
sudo systemctl start sentiment-api
```

## Security Considerations

⚠️ **Important for Production:**

1. **CORS**: Update `allow_origins` to specify your frontend URL instead of `"*"`
2. **API Keys**: Add authentication/authorization
3. **Rate Limiting**: Implement rate limiting to prevent abuse
4. **HTTPS**: Always use HTTPS in production
5. **Environment Variables**: Never commit `.env` files to version control

## Troubleshooting

**Scripts not found:**
- Make sure `text_insights_specific.py` and `text_insights_relevant.py` are in the same directory as `api.py`

**Supabase connection failed:**
- Check your `.env` file has correct `SUPABASE_URL` and `SUPABASE_KEY`
- Verify the API can find and load the `.env` file

**Jobs stuck in "pending" status:**
- Check server logs for errors
- Verify Python scripts have execute permissions
- Ensure all dependencies are installed

**File not found errors:**
- Verify file exists in the correct Supabase bucket
- Check file path doesn't include bucket name (just the filename)

## Next Steps

- [ ] Add authentication/authorization
- [ ] Implement WebSocket for real-time job updates
- [ ] Add file upload endpoint for transcripts
- [ ] Add batch processing for multiple files
- [ ] Implement caching for frequently accessed results
- [ ] Add more detailed error messages
- [ ] Implement job cleanup (remove old jobs from memory)
- [ ] Add database persistence for job history