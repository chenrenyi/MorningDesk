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
  node ".\scripts\build-wallpaper.js" $Version
} else {
  node ".\scripts\build-wallpaper.js"
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Output ""
Write-Output "Wallpaper Engine executable:"
$latestWallpaper = Get-ChildItem -LiteralPath ".\dist\wallpaper-releases" -Filter "MorningDeskWallpaper-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$latestWallpaper | Select-Object FullName, Length, LastWriteTime

$stableWallpaperDir = ".\dist\wallpaper-releases\for wallper"
$stableWallpaperPath = Join-Path $stableWallpaperDir "MorningDeskWallpaper-current.exe"
New-Item -ItemType Directory -Force -Path $stableWallpaperDir | Out-Null
Copy-Item -LiteralPath $latestWallpaper.FullName -Destination $stableWallpaperPath -Force

Write-Output ""
Write-Output "Stable Wallpaper Engine executable:"
Get-Item -LiteralPath $stableWallpaperPath | Select-Object FullName, Length, LastWriteTime
