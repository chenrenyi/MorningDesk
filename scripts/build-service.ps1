param(
  [string]$Version = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $projectRoot "dist"
$serviceDir = Join-Path $distDir "service"
$payloadDir = Join-Path $distDir "build\payload"
$backendExe = Join-Path $payloadDir "MorningDeskBackend.exe"

if (-not $Version) {
  $Version = (Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json).version
}

if (-not $SkipBuild) {
  & node (Join-Path $projectRoot "scripts\build-companion.js") "--backend-only"
  if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }
}

if (-not (Test-Path -LiteralPath $backendExe)) {
  throw "Backend executable not found: $backendExe"
}

New-Item -ItemType Directory -Force -Path $serviceDir | Out-Null
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $csc)) { throw "csc.exe not found: $csc" }

$assemblyInfo = Join-Path $serviceDir "AssemblyInfo.cs"
$assemblyVersion = "$Version.0".Split(".")[0..3] -join "."
@"
using System.Reflection;
[assembly: AssemblyVersion("$assemblyVersion")]
[assembly: AssemblyFileVersion("$assemblyVersion")]
[assembly: AssemblyTitle("MorningDesk Backend Host")]
[assembly: AssemblyProduct("MorningDesk")]
[assembly: AssemblyDescription("Silent watchdog that keeps the MorningDesk backend running")]
"@ | Set-Content -LiteralPath $assemblyInfo -Encoding UTF8

$hostExe = Join-Path $serviceDir "MorningDeskBackendHost.exe"
& $csc /nologo /target:winexe /out:$hostExe /reference:System.dll `
  (Join-Path $projectRoot "desktop\BackendHost.cs") $assemblyInfo
if ($LASTEXITCODE -ne 0) { throw "Host build failed." }

Copy-Item -LiteralPath $backendExe -Destination (Join-Path $serviceDir "MorningDeskBackend.exe") -Force
Remove-Item -LiteralPath $assemblyInfo -Force -ErrorAction SilentlyContinue

Write-Output "Service payload: $serviceDir"
Get-ChildItem -LiteralPath $serviceDir | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Write-Output
