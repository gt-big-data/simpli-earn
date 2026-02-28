# Secret Management Setup Guide

This guide explains how to set up the OpenAI API key as a secret in Google Cloud Secret Manager for use with Cloud Build and Cloud Run.

## Prerequisites

1. Google Cloud SDK (`gcloud`) installed and authenticated
2. A Google Cloud project with the following APIs enabled:
   - Secret Manager API
   - Cloud Build API
   - Cloud Run API

## Step 1: Create the Secret

Run the setup script with your project ID:

```bash
./setup-secret.sh YOUR_PROJECT_ID
```

Or manually create the secret:

```bash
# Set your project ID
export PROJECT_ID="your-project-id"

# Create the secret (you'll be prompted to enter the API key)
echo -n "YOUR_OPENAI_API_KEY_HERE" | \
gcloud secrets create openai-api-key \
  --data-file=- \
  --project="$PROJECT_ID"
```

**Note:** Replace `YOUR_OPENAI_API_KEY_HERE` with your actual OpenAI API key. The API key should be stored securely and not committed to the repository.

## Step 2: Grant Permissions

### Grant Cloud Build Service Account Access

Cloud Build needs permission to access the secret during deployment:

```bash
export PROJECT_ID="your-project-id"
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')

gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID"
```

### Grant Cloud Run Service Account Access

Cloud Run needs permission to access the secret at runtime:

```bash
gcloud secrets add-iam-policy-binding openai-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT_ID"
```

## Step 3: Verify Setup

Verify the secret exists:

```bash
gcloud secrets describe openai-api-key --project="$PROJECT_ID"
```

## How It Works

The `cloudbuild.yaml` file is configured to:
1. Use `--set-secrets` instead of `--set-env-vars` for the `OPENAI_API_KEY`
2. Reference the secret as `openai-api-key:latest` (always uses the latest version)
3. Cloud Run will automatically inject the secret value as an environment variable at runtime

## Updating the Secret

To update the secret with a new API key:

```bash
echo -n "YOUR_NEW_API_KEY" | \
gcloud secrets versions add openai-api-key \
  --data-file=- \
  --project="$PROJECT_ID"
```

The `:latest` reference in the Cloud Run deployment will automatically use the new version on the next deployment.

## Security Notes

- ✅ The API key is stored securely in Secret Manager
- ✅ The key is never exposed in build logs or environment variables
- ✅ Only authorized service accounts can access the secret
- ✅ The secret is injected at runtime, not at build time

