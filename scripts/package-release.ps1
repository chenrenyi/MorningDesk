param(
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Version) {
  $Version = (Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
}

Write-Host "构建后端..." -ForegroundColor Cyan
& node (Join-Path $projectRoot "scripts\build-companion.js") "--backend-only"
if ($LASTEXITCODE -ne 0) { throw "后端构建失败" }

Write-Host "构建静默守护器..." -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\build-service.ps1") -SkipBuild
if ($LASTEXITCODE -ne 0) { throw "守护器构建失败" }

$serviceDir = Join-Path $projectRoot "dist\service"
$productRoot = Join-Path $projectRoot "dist\package\MorningDeskBackend-$Version"
$releaseDir = Join-Path $projectRoot "release"

Write-Host "组装 $productRoot ..." -ForegroundColor Cyan
if (Test-Path $productRoot) { Remove-Item $productRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $productRoot, $releaseDir | Out-Null

Copy-Item (Join-Path $serviceDir "MorningDeskBackend.exe") $productRoot -Force
Copy-Item (Join-Path $serviceDir "MorningDeskBackendHost.exe") $productRoot -Force
Copy-Item (Join-Path $projectRoot "packaging\*") $productRoot -Recurse -Force

$licenseDir = Join-Path $productRoot "licenses"
New-Item -ItemType Directory -Force -Path $licenseDir | Out-Null
Copy-Item (Join-Path $projectRoot "third_party\node\LICENSE") (Join-Path $licenseDir "node-LICENSE.txt") -Force
Copy-Item (Join-Path $projectRoot "third_party\LibreHardwareMonitor\LICENSE") (Join-Path $licenseDir "LibreHardwareMonitor-LICENSE.txt") -Force
Copy-Item (Join-Path $projectRoot "THIRD_PARTY_NOTICES.md") (Join-Path $licenseDir "THIRD_PARTY_NOTICES.txt") -Force
Copy-Item (Join-Path $projectRoot "LICENSE") (Join-Path $productRoot "LICENSE.txt") -Force

$hashes = Get-ChildItem $productRoot -File | Where-Object { $_.Extension -in @(".exe", ".ps1", ".cmd", ".txt") } |
  ForEach-Object { "{0}  {1}" -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name }
$hashes | Set-Content -LiteralPath (Join-Path $productRoot "SHA256SUMS.txt") -Encoding ASCII

$zipPath = Join-Path $releaseDir "MorningDeskBackend-$Version.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Write-Host "压缩 $zipPath ..." -ForegroundColor Cyan
$sevenZip = Get-Command 7z -ErrorAction SilentlyContinue
if ($sevenZip) {
  Push-Location $productRoot
  try {
    & $sevenZip.Source a -tzip -mx=7 $zipPath "*" | Out-Null
  } finally {
    Pop-Location
  }
} else {
  Compress-Archive -Path (Join-Path $productRoot "*") -DestinationPath $zipPath -Force
}
if (-not (Test-Path $zipPath)) { throw "压缩失败" }

$zipHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLower()
"$zipHash  MorningDeskBackend-$Version.zip" | Set-Content -LiteralPath (Join-Path $releaseDir "SHA256SUMS.txt") -Encoding ASCII

Write-Host ""
Write-Host "完成" -ForegroundColor Green
Write-Host ("  产物目录 : " + $productRoot)
Write-Host ("  发布压缩包: " + $zipPath)
Write-Host ("  大小     : {0:N1} MB" -f ((Get-Item $zipPath).Length / 1MB))
Write-Host ("  SHA256   : " + $zipHash)
