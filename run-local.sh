#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
printf '%s\n' 'Grandmaster Companion Pro is available at http://localhost:8000/' 'Keep this window open while using the app. Press Ctrl+C to stop the local server.'
exec python3 -m http.server 8000 --bind 127.0.0.1
