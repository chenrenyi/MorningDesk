param(
  [string]$BackendPath = "$env:LOCALAPPDATA\MorningDeskWallpaper\1.2.1.0\MorningDeskBackend.exe",
  [string]$TaskName = "MorningDeskDashboardBackend",
  [int]$Port = 43761
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$hiddenLauncher = Join-Path $PSScriptRoot "start-hidden-backend.ps1"
$powershell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path -LiteralPath $BackendPath)) {
  throw "Morning Desk backend not found: $BackendPath"
}

$arguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$hiddenLauncher`" -BackendPath `"$BackendPath`" -Port $Port"
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Output "Installed scheduled task: $TaskName"
