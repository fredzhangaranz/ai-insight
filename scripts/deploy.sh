#!/bin/bash

# Deployment script for Insight Gen
# Usage: ./scripts/deploy.sh [export|build|acr|setup-credentials]

set -e

IMAGE_NAME="insight-gen"
TAG="latest"
EXPORT_FILE="insight-gen.tar"

echo "🚀 Insight Gen Deployment Script"

case "${1:-build}" in
  "build")
    echo "📦 Building production Docker image..."
    docker build -f Dockerfile.prod -t ${IMAGE_NAME}:${TAG} .
    echo "✅ Build complete! Image: ${IMAGE_NAME}:${TAG}"
    echo ""
    echo "To run locally:"
    echo "  docker run -p 3005:3005 ${IMAGE_NAME}:${TAG}"
    echo ""
    echo "To export for deployment:"
    echo "  ./scripts/deploy.sh export"
    ;;
    
  "export")
    echo "📦 Building and exporting Docker image..."
    docker build -f Dockerfile.prod -t ${IMAGE_NAME}:${TAG} .
    docker save ${IMAGE_NAME}:${TAG} > ${EXPORT_FILE}
    echo "✅ Export complete! File: ${EXPORT_FILE}"
    echo ""
    echo "Transfer ${EXPORT_FILE} to your deployment server, then run:"
    echo "  docker load < ${EXPORT_FILE}"
    echo "  docker run -p 3005:3005 ${IMAGE_NAME}:${TAG}"
    ;;
    
  "acr")
    if [ -z "$2" ]; then
      echo "❌ Error: ACR registry name required"
      echo "Usage: ./scripts/deploy.sh acr <registry-name>"
      exit 1
    fi
    REGISTRY=$2
    echo "📦 Building and pushing to Azure Container Registry..."
    docker build -f Dockerfile.prod -t ${REGISTRY}.azurecr.io/${IMAGE_NAME}:${TAG} .
    docker push ${REGISTRY}.azurecr.io/${IMAGE_NAME}:${TAG}
    echo "✅ Push complete! Image: ${REGISTRY}.azurecr.io/${IMAGE_NAME}:${TAG}"
    echo ""
    echo "On deployment server, run:"
    echo "  docker pull ${REGISTRY}.azurecr.io/${IMAGE_NAME}:${TAG}"
    echo "  docker run -p 3005:3005 ${REGISTRY}.azurecr.io/${IMAGE_NAME}:${TAG}"
    ;;

  "setup-credentials")
    echo "🔐 Setting up credentials directory..."
    mkdir -p credentials
    echo "✅ Created credentials directory"
    echo ""
    echo "📝 Please add your AI service credentials:"
    echo ""
    echo "1. For Anthropic Claude:"
    echo "   Create .env.production with:"
    echo "   ANTHROPIC_API_KEY=your_api_key_here"
    echo ""
    echo "2. For Google Vertex AI:"
    echo "   Place your Google service account JSON file in:"
    echo "   credentials/google-credentials.json"
    echo ""
    echo "3. Set environment variables:"
    echo "   GOOGLE_CLOUD_PROJECT=your_project_id"
    echo "   GOOGLE_CLOUD_LOCATION=us-central1"
    echo ""
    echo "📋 Example .env.production:"
    cat << EOF
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/insight_gen_db

# AI Services (choose one or both)
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
GOOGLE_CLOUD_PROJECT=your-google-project-id
GOOGLE_CLOUD_LOCATION=us-central1

# Optional: Override default AI model names per provider
ANTHROPIC_DEFAULT_MODEL_NAME=claude-3-5-sonnet-latest
GOOGLE_DEFAULT_MODEL_NAME=gemini-2.5-pro
EOF
    ;;
    
  *)
    echo "Usage: ./scripts/deploy.sh [build|export|acr <registry-name>|setup-credentials]"
    echo ""
    echo "Commands:"
    echo "  build              - Build production image locally"
    echo "  export             - Build and export as tar file"
    echo "  acr <registry>     - Build and push to Azure Container Registry"
    echo "  setup-credentials  - Set up credentials directory and instructions"
    exit 1
    ;;
esac
