$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
docker build -t pm-app .
if (docker ps -aq --filter name=pm-app) { docker rm -f pm-app }
docker run -d --name pm-app -p 8000:8000 --env-file .env -v pm-data:/data pm-app
Write-Host "Running at http://localhost:8000"
