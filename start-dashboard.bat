@echo off
cd /d "%~dp0"
if not defined PORT set "PORT=43761"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { Start-Process -FilePath '%~f0' -Verb RunAs; exit 1 }"
if errorlevel 1 exit /b
for /f "delims=" %%i in ('powershell.exe -NoProfile -Command "Get-ChildItem -LiteralPath '%~dp0dist\releases' -Filter 'MorningDeskDashboard-*.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName"') do set "DASHBOARD_EXE=%%i"
if defined DASHBOARD_EXE (
  start "Morning Desk Dashboard" /min "%DASHBOARD_EXE%"
  exit /b
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalPort $env:PORT -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($listener) { try { $health = Invoke-RestMethod -Uri \"http://127.0.0.1:$env:PORT/api/health\" -TimeoutSec 2; if (-not $health.ok) { exit 2 }; Stop-Process -Id $listener.OwningProcess -Force; Start-Sleep -Milliseconds 500 } catch { exit 2 } }"
if errorlevel 2 (
  echo Dashboard port is already used by another application.
  pause
  exit /b
)
start "Ambient Dashboard Server" /min cmd /c "npm start"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:%PORT%"
