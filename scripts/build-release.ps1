param(
  [string]$Version
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path -LiteralPath ".\node_modules")) {
  npm install --no-audit --no-fund
}

npm run check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($Version) {
  node ".\scripts\build-companion.js" $Version
} else {
  node ".\scripts\build-companion.js"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output ""
Write-Output "Release executable:"
Get-ChildItem -LiteralPath ".\dist\releases" -Filter "MorningDeskDashboard-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1 FullName, Length, LastWriteTime
