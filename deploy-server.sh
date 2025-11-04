#!/usr/bin/env bash
set -e

IMAGE_NAME="chatter-server-deploy-image"
CONTAINER_NAME="chatter-server-deploy"
GOOGLE_KEY_FILE="$(pwd)/voice-first-473522-b0fe677d3766.json"
GOOGLE_KEY_PATH="/workspace/voice-first-473522-b0fe677d3766.json"

echo "🛠️  Building Docker image: $IMAGE_NAME ..."
docker build --no-cache -t "$IMAGE_NAME" .

if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
  echo "🧹  Removing existing container: $CONTAINER_NAME ..."
  docker rm -f "$CONTAINER_NAME"
fi

echo "🚀  Running container: $CONTAINER_NAME ..."
docker run --rm -it \
  --name "$CONTAINER_NAME" \
  -v "$GOOGLE_KEY_FILE":"$GOOGLE_KEY_PATH":ro \
  -e GOOGLE_APPLICATION_CREDENTIALS="$GOOGLE_KEY_PATH" \
  -e PROJECT_ID="voice-first-473522" \
  -e SERVICE_NAME="websocket-server" \
  -e REGION="us-central1" \
  "$IMAGE_NAME"

echo "✅  Container '$CONTAINER_NAME' is running."
echo "   Using Google credentials from: $GOOGLE_KEY_FILE"