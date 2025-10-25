#!/usr/bin/env bash
set -e

PROJECT_ID=${PROJECT_ID:-"voice-first-473522"}
SERVICE_NAME=${SERVICE_NAME:-"websocket-server"}
REGION=${REGION:-"us-central1"}
GOOGLE_KEY_PATH=${GOOGLE_APPLICATION_CREDENTIALS:-"/app/voice-first-473522-b0fe677d3766.json"}

# Verify key exists
if [ ! -f "$GOOGLE_KEY_PATH" ]; then
  echo "❌ Google credentials file not found at $GOOGLE_KEY_PATH"
  exit 1
fi

echo "🔑 Activating service account..."
gcloud auth activate-service-account --key-file="$GOOGLE_KEY_PATH"

echo "🌍 Setting project to $PROJECT_ID..."
gcloud config set project "$PROJECT_ID"

echo "🚀 Deploying Cloud Run service $SERVICE_NAME from source..."
gcloud run deploy "$SERVICE_NAME" \
  --source /workspace/apps/server \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --allow-unauthenticated \
  --quiet

echo "✅ Deployment complete."
