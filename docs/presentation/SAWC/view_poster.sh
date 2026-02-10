#!/bin/bash
# Quick script to view the poster mockup in your browser

echo "🎨 Opening SAWC Poster Mockup..."
echo ""
echo "Starting local web server on port 8080..."
echo "Open your browser to: http://localhost:8080/POSTER_MOCKUP.html"
echo ""
echo "Press Ctrl+C to stop the server when done"
echo ""

cd "$(dirname "$0")"
python3 -m http.server 8080
