@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on this computer.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)

echo Starting the Lomket CBT student web server only...
echo Use this only for troubleshooting. The normal admin app is Start-Lomket-CBT.cmd.
node server\index.js --host 0.0.0.0 --port 4090
pause
