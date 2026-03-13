$ErrorActionPreference = "Stop"

$root = "C:\sw-grader"
New-Item -ItemType Directory -Force -Path $root
Set-Location $root

Write-Host "Installing Chocolatey..."

Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = 3072

Invoke-Expression (
  (New-Object System.Net.WebClient).DownloadString(
    "https://community.chocolatey.org/install.ps1"
  )
)

refreshenv

Write-Host "Installing dependencies..."

choco install -y git
choco install -y nodejs-lts
choco install -y dotnet-8.0-runtime
choco install -y 7zip

refreshenv

Write-Host "Downloading Solidworks admin image..."

Invoke-WebRequest `
  -Uri "https://cdn.jackcrane.rocks/featurebench/sw2025-sp5.zip" `
  -OutFile "sw.zip"

7z x sw.zip -osolidworks

Write-Host "Cloning repo..."

git clone https://github.com/jackcrane/sw-grader-api.git

Set-Location sw-grader-api/api

Write-Host "Installing npm dependencies..."

npm install

Write-Host "Downloading SwExtractor..."

Invoke-WebRequest `
  -Uri "https://github.com/jackcrane/SwExtractor/releases/download/0.1.0/net8.0.zip" `
  -OutFile "extractor.zip"

Expand-Archive extractor.zip -DestinationPath "extractor"

$extractorPath = "$PWD\extractor\net8.0\SwExtractor.exe"

[Environment]::SetEnvironmentVariable(
  "SW_EXTRACTOR_PATH",
  $extractorPath,
  "Machine"
)

Write-Host "Starting API..."

npm start