#!/bin/bash

# Script to set up OpenAI API key in Google Cloud Secret Manager
# Usage: ./setup-secret.sh

PROJECT_ID="${1:-your-project-id}"
SECRET_NAME="openai-api-key"

echo "Setting up secret: $SECRET_NAME in project: $PROJECT_ID"

# Check if secret already exists
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "Secret $SECRET_NAME already exists. Adding new version..."
    echo "Please enter your OpenAI API key:"
    read -s API_KEY
    echo -n "$API_KEY" | \
    gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"
else
    echo "Creating new secret: $SECRET_NAME"
    echo "Please enter your OpenAI API key:"
    read -s API_KEY
    echo -n "$API_KEY" | \
    gcloud secrets create "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"
fi

echo "Secret $SECRET_NAME has been set up successfully!"
echo ""
echo "Next steps:"
echo "1. Grant Cloud Build service account access to the secret:"
echo "   gcloud secrets add-iam-policy-binding $SECRET_NAME \\"
echo "     --member=\"serviceAccount:\$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')@cloudbuild.gserviceaccount.com\" \\"
echo "     --role=\"roles/secretmanager.secretAccessor\" \\"
echo "     --project=\"$PROJECT_ID\""
echo ""
echo "2. Grant Cloud Run service account access to the secret:"
echo "   gcloud secrets add-iam-policy-binding $SECRET_NAME \\"
echo "     --member=\"serviceAccount:\$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')-compute@developer.gserviceaccount.com\" \\"
echo "     --role=\"roles/secretmanager.secretAccessor\" \\"
echo "     --project=\"$PROJECT_ID\""

