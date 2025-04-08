# Sentiment Analysis

## GCP Usage

Use the '<simpliearnbdbi@gmail.com>' account.

Project ID: simpliearn-452813

Bucket Name: 'simpliearn-audio'

- the chunked audio files can be found.

## Prerequisites

Right now you have to have your full earning call audio file within the same directory level as your main.py file. Might change this later on for better structure.

1. Authorize SimpliEarn account (ask for access to the team leaders or so)

```bash
gcloud auth login
```

2. Set Project ID

```bash
gcloud config set project simpliearn-452813
```

3. Confirm if you have access

```bash
gsutil ls gs://simpliearn-audio/
```

4. Install the requirements (run a venv optimally)

```bash
pip install -r requirements.txt
```

5. Run the main.py

You can modify what you want to run. Right now the chunks are already in the gcs, so you can exclude the chunking/storing part from the main.py code
