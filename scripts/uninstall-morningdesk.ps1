param(
  [string]$TaskName = "MorningDesk Backend"
)

$ErrorActionPreference = "SilentlyContinue"
$installRoot = Split-Path -Parent $PSCommandPath
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -TaskName `"$TaskName`""
  try {
    Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $arguments -Wait | Out-Null
  } catch {
    Write-Host "需要管理员权限才能删除计划任务。" -ForegroundColor Red
  }
  exit
}

Write-Host "停止并删除计划任务 $TaskName ..." -ForegroundColor Cyan
Stop-ScheduledTask -TaskName $TaskName
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false

Write-Host "结束后台进程..." -ForegroundColor Cyan
Get-Process -Name "MorningDeskBackendHost", "MorningDeskBackend" -ErrorAction SilentlyContinue |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800

Write-Host "删除开始菜单快捷方式..." -ForegroundColor Cyan
Remove-Item -LiteralPath (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\MorningDesk") -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "删除 $installRoot ..." -ForegroundColor Cyan
# The script itself lives inside the directory that has to be removed, so let a
# detached cmd wait for this process to exit before deleting the tree.
$cleanup = Join-Path $env:TEMP ("morningdesk-uninstall-" + [guid]::NewGuid().ToString("N") + ".cmd")
@"
@echo off
timeout /t 3 /nobreak >nul
rmdir /s /q "$installRoot"
del /f /q "%~f0"
"@ | Set-Content -LiteralPath $cleanup -Encoding ASCII
Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$cleanup`"" -WindowStyle Hidden

Write-Host "MorningDesk 后台已卸载。" -ForegroundColor Green
