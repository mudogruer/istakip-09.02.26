@echo off
echo ========================================
echo    PVC Web Project - Development Server
echo ========================================
echo.

:: Backend başlat (yeni terminal penceresinde)
echo [1/2] Backend sunucusu baslatiliyor...
start "Backend API" cmd /k "cd /d %~dp0md.service & py -m uvicorn app.main:app --reload --port 8000"

:: 2 saniye bekle
timeout /t 2 /nobreak >nul

:: Frontend başlat (yeni terminal penceresinde)
echo [2/2] Frontend sunucusu baslatiliyor...
start "Frontend Dev" cmd /k "cd /d %~dp0md.web & npm run dev"

echo.
echo ========================================
echo   Sunucular baslatildi!
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo ========================================
echo.
echo Bu pencereyi kapatabilirsiniz.
pause
