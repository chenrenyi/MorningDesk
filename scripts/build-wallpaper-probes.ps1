param(
  [ValidateSet("solid", "webview", "corewebview")]
  [string]$Probe = "solid"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $projectRoot "dist\wallpaper-probes"
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"

New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

if ($Probe -eq "solid") {
  & $csc `
    /nologo `
    /target:winexe `
    "/out:$outputDir\MorningDeskSolidProbe.exe" `
    /reference:System.dll `
    /reference:System.Drawing.dll `
    /reference:System.Windows.Forms.dll `
    "$projectRoot\desktop\probes\SolidWallpaperProbe.cs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Probe -eq "webview") {
  $sdkRoot = & "$projectRoot\scripts\ensure-webview2-sdk.ps1" -TargetDir "$projectRoot\.cache" |
    Select-Object -Last 1
  $coreDll = Join-Path $sdkRoot "lib\net462\Microsoft.Web.WebView2.Core.dll"
  $winFormsDll = Join-Path $sdkRoot "lib\net462\Microsoft.Web.WebView2.WinForms.dll"
  Copy-Item -LiteralPath $coreDll -Destination "$outputDir\Microsoft.Web.WebView2.Core.dll" -Force
  Copy-Item -LiteralPath $winFormsDll -Destination "$outputDir\Microsoft.Web.WebView2.WinForms.dll" -Force
  Copy-Item -LiteralPath "$sdkRoot\runtimes\win-x64\native\WebView2Loader.dll" -Destination "$outputDir\WebView2Loader.dll" -Force
  & $csc `
    /nologo `
    /target:winexe `
    "/out:$outputDir\MorningDeskWebViewProbe.exe" `
    /reference:System.dll `
    /reference:System.Drawing.dll `
    /reference:System.Windows.Forms.dll `
    "/reference:$coreDll" `
    "/reference:$winFormsDll" `
    "$projectRoot\desktop\probes\WebViewWallpaperProbe.cs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

if ($Probe -eq "corewebview") {
  $sdkRoot = & "$projectRoot\scripts\ensure-webview2-sdk.ps1" -TargetDir "$projectRoot\.cache" |
    Select-Object -Last 1
  $coreDll = Join-Path $sdkRoot "lib\net462\Microsoft.Web.WebView2.Core.dll"
  Copy-Item -LiteralPath $coreDll -Destination "$outputDir\Microsoft.Web.WebView2.Core.dll" -Force
  Copy-Item -LiteralPath "$sdkRoot\runtimes\win-x64\native\WebView2Loader.dll" -Destination "$outputDir\WebView2Loader.dll" -Force
  & $csc `
    /nologo `
    /target:winexe `
    "/out:$outputDir\MorningDeskCoreWebViewProbe.exe" `
    /reference:System.dll `
    /reference:System.Drawing.dll `
    /reference:System.Windows.Forms.dll `
    "/reference:$coreDll" `
    "$projectRoot\desktop\probes\CoreWebViewWallpaperProbe.cs"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Output "Built wallpaper probe: $outputDir"
