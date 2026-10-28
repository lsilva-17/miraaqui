@echo off
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
 echo Instale o Node.js 24 ou superior antes de iniciar o Miraaqui.
 pause
 exit /b 1
)
start "" "http://localhost:4317"
node server.mjs
pause
