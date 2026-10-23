param(
  [string]$TargetDir
)

$ErrorActionPreference = "Stop"
$packageRoot = Join-Path $TargetDir "Microsoft.Web.WebView2"
$versionFile = Join-Path $packageRoot ".version"
if (Test-Path -LiteralPath $versionFile) {
  Write-Output $packageRoot
  exit 0
}

$versions = Invoke-RestMethod "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/index.json"
$version = $versions.versions |
  Where-Object { $_ -notmatch "-" } |
  Select-Object -Last 1
if (-not $version) { throw "Unable to find a stable Microsoft.Web.WebView2 package." }

$archive = Join-Path $TargetDir "Microsoft.Web.WebView2.$version.zip"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
Invoke-WebRequest "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$version/microsoft.web.webview2.$version.nupkg" -OutFile $archive
if (Test-Path -LiteralPath $packageRoot) { Remove-Item -LiteralPath $packageRoot -Recurse -Force }
Expand-Archive -LiteralPath $archive -DestinationPath $packageRoot
Remove-Item -LiteralPath $archive -Force
Set-Content -LiteralPath $versionFile -Value $version -NoNewline
Write-Output $packageRoot
