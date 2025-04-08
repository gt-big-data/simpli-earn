# Sentiment Analysis

## GCP Usage

Use the '<simpliearnbdbi@gmail.com>' account.

Project ID: simpliearn-452813

Bucket Name: 'simpliearn-audio'

- the chunked audio files can be found.

## Prerequisites

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

4. Install the requirements

```bash
pip install -r requirements.txt
```

5. Run the main.py

You can modify what you want to run. Right now the chunks are already in the gcs, so you can exclude the chunking/storing part from the main.py code

