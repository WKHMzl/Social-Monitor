@echo off
echo Stopping Reddit Monitor...
echo.

REM Kill process on port 8000 (Backend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000') do (
    taskkill /F /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo [✓] Backend stopped ^(port 8000^)
    )
)

REM Kill process on port 3002 (Frontend)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3002') do (
    taskkill /F /PID %%a 2>nul
    if !errorlevel! equ 0 (
        echo [✓] Frontend stopped ^(port 3002^)
    )
)

echo.
echo All Reddit Monitor processes stopped.
echo.
pause
