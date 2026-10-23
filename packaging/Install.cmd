@echo off
setlocal
cd /d "%~dp0"
echo.
echo  Installing MorningDesk backend...
echo  A single UAC prompt will appear. Please click "Yes".
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
if errorlevel 1 (
  echo.
  echo  Installation failed. Read the messages above.
  pause
  exit /b 1
)
echo.
echo  Done. You can close this window.
timeout /t 3 >nul
