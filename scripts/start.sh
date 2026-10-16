#!/bin/sh
set -e
cd "$(dirname "$0")/.."
docker build -t pm-app .
docker rm -f pm-app >/dev/null 2>&1 || true
docker run -d --name pm-app -p 127.0.0.1:8000:8000 --env-file .env -v pm-data:/data pm-app
echo "Running at http://localhost:8000"
