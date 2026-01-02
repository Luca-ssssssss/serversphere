@echo off
echo 🚀 Starting ServerSphere...
echo ==========================

REM Check if .env exists
if not exist .env (
    echo ❌ .env file not found!
    echo    Run: npm run setup
    pause
    exit /b 1
)

REM Check if node_modules exists
if not exist node_modules (
    echo 📦 Installing dependencies...
    call npm install
)

REM Start the server
echo 🌐 Starting ServerSphere...
node server.js
pause