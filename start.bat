@echo off
title SocialMonitor
echo ========================================
echo    SocialMonitor - Starting...
echo ========================================
echo.

REM Kill stale processes on the ports (ignores errors if nothing is running)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002 2^>nul') do taskkill /F /PID %%a >nul 2>&1

REM Start backend using full path to venv uvicorn (no activate needed)
echo [1/2] Iniciando backend...
cd /d "%~dp0backend"
start /B "" venv\Scripts\uvicorn.exe main:app --port 8000

REM Wait for backend to initialize (PRAW takes a few seconds)
echo     Aguardando backend inicializar (6s)...
timeout /t 6 /nobreak > nul

REM Start frontend
echo [2/2] Iniciando frontend...
cd /d "%~dp0frontend"
start /B npm run dev

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:3002
echo.
echo Pressione qualquer tecla para parar os servicos...
echo.
pause > nul

echo Parando servicos...
call "%~dp0stop.bat" > nul 2>&1
echo Pronto.
