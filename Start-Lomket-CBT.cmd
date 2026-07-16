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

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install the standard Node.js package from nodejs.org.
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Installing the desktop runtime. Internet is required the first time.
  npm install
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo Starting Lomket CBT Admin Desktop...
echo Keep this window open while the admin desktop app and student web links are in use.
npm run desktop
pause
