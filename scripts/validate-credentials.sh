#!/bin/bash

# Credential validation script for Insight Gen
# Usage: ./scripts/validate-credentials.sh

set -e

echo "🔍 Insight Gen Credential Validation"
echo "====================================="

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    echo "❌ .env.production file not found"
    echo "   Please create .env.production with your configuration"
    echo "   Use env.production.example as a template"
    exit 1
fi

echo "✅ .env.production file found"

# Load environment variables
source .env.production

# Check database configuration
echo ""
echo "📊 Database Configuration:"
if [ -n "$DATABASE_URL" ]; then
    echo "✅ DATABASE_URL is set"
    # Extract database type from URL
    if [[ "$DATABASE_URL" == *"postgresql"* ]]; then
        echo "   Type: PostgreSQL"
    elif [[ "$DATABASE_URL" == *"mysql"* ]]; then
        echo "   Type: MySQL"
    elif [[ "$DATABASE_URL" == *"mssql"* ]]; then
        echo "   Type: SQL Server"
    else
        echo "   Type: Unknown"
    fi
else
    echo "❌ DATABASE_URL is not set"
fi

# Check AI service configuration
echo ""
echo "🤖 AI Service Configuration:"

# Check Anthropic
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "✅ ANTHROPIC_API_KEY is set"
    if [[ "$ANTHROPIC_API_KEY" == "sk-ant-api03-"* ]]; then
        echo "   Format: Valid Anthropic API key format"
    else
        echo "   ⚠️  Format: May not be a valid Anthropic API key"
    fi
else
    echo "❌ ANTHROPIC_API_KEY is not set"
fi

# Check Google Cloud
if [ -n "$GOOGLE_CLOUD_PROJECT" ]; then
    echo "✅ GOOGLE_CLOUD_PROJECT is set: $GOOGLE_CLOUD_PROJECT"
else
    echo "❌ GOOGLE_CLOUD_PROJECT is not set"
fi

if [ -n "$GOOGLE_CLOUD_LOCATION" ]; then
    echo "✅ GOOGLE_CLOUD_LOCATION is set: $GOOGLE_CLOUD_LOCATION"
else
    echo "ℹ️  GOOGLE_CLOUD_LOCATION not set (will use default: us-central1)"
fi

# Check Google credentials file
if [ -n "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    echo "✅ GOOGLE_APPLICATION_CREDENTIALS path: $GOOGLE_APPLICATION_CREDENTIALS"
else
    echo "ℹ️  GOOGLE_APPLICATION_CREDENTIALS not set (will use default: /app/credentials/google-credentials.json)"
fi

# Check if credentials directory exists
if [ -d "credentials" ]; then
    echo "✅ credentials directory exists"
    
    # Check for Google credentials file
    if [ -f "credentials/google-credentials.json" ]; then
        echo "✅ Google credentials file found"
        
        # Validate JSON format
        if python3 -m json.tool "credentials/google-credentials.json" > /dev/null 2>&1; then
            echo "✅ Google credentials file is valid JSON"
        else
            echo "❌ Google credentials file is not valid JSON"
        fi
    else
        echo "ℹ️  Google credentials file not found (not needed if using Anthropic only)"
    fi
else
    echo "ℹ️  credentials directory not found (will be created by Docker)"
fi

# Check AI model selection
echo ""
echo "🧠 AI Model Configuration:"
if [ -n "$AI_MODEL_NAME" ]; then
    echo "✅ AI_MODEL_NAME is set: $AI_MODEL_NAME"
    
    # Validate model name
    case "$AI_MODEL_NAME" in
        "claude-3-5-sonnet-latest"|"claude-3-opus-latest"|"gemini-2.5-pro"|"gemini-1.5-flash-latest")
            echo "✅ Valid AI model selected"
            ;;
        *)
            echo "⚠️  Unknown AI model: $AI_MODEL_NAME"
            echo "   Supported models: claude-3-5-sonnet-latest, claude-3-opus-latest, gemini-2.5-pro, gemini-1.5-flash-latest"
            ;;
    esac
else
    echo "ℹ️  AI_MODEL_NAME not set (will use default: claude-3-5-sonnet-latest)"
fi

# Summary
echo ""
echo "📋 Summary:"
echo "==========="

if [ -n "$DATABASE_URL" ] && ([ -n "$ANTHROPIC_API_KEY" ] || [ -n "$GOOGLE_CLOUD_PROJECT" ]); then
    echo "✅ Configuration appears complete"
    echo ""
    echo "🚀 Ready to deploy! Run:"
    echo "   docker run -p 3005:3005 --env-file .env.production -v \$(pwd)/credentials:/app/credentials:ro insight-gen:latest"
else
    echo "❌ Configuration incomplete"
    echo ""
    echo "Please ensure you have:"
    echo "1. DATABASE_URL set"
    echo "2. At least one AI service configured (Anthropic or Google)"
    echo ""
    echo "See env.production.example for reference"
fi
