#!/bin/sh
set -e
helm upgrade --install "$SERVICE_NAME" ./helm \
  --namespace "$NAMESPACE" \
  --create-namespace \
  --values helm/values-prod.yaml \
  --set image.repository="$ECR_REGISTRY/$ECR_REPO" \
  --set image.tag="$IMAGE_TAG" \
  --wait \
  --timeout 300s
