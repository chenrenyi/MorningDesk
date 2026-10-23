param(
  [string]$BackendPath = "$env:LOCALAPPDATA\MorningDeskWallpaper\1.2.1.0\MorningDeskBackend.exe",
  [int]$Port = 43761
)

$ErrorActionPreference = "Stop"

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1
if ($listener) {
  exit 0
}

if (-not (Test-Path -LiteralPath $BackendPath)) {
  throw "Morning Desk backend not found: $BackendPath"
}

Start-Process -FilePath $BackendPath -WindowStyle Hidden -WorkingDirectory (Split-Path -Parent $BackendPath)
