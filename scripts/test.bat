@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

set "CMD=%~1"
if "%CMD%"=="" goto usage
if /i "%CMD%"=="help" goto usage
if /i "%CMD%"=="backend" goto backend
if /i "%CMD%"=="e2e" goto e2e
if /i "%CMD%"=="smoke" goto smoke
if /i "%CMD%"=="all" goto all
goto usage

:usage
echo.
echo Test komutlari: scripts\test.bat [backend^|e2e^|smoke^|all]
echo.
echo   backend  - Backend pytest testleri
echo   e2e      - Frontend Playwright E2E (backend ayakta olmali)
echo   smoke    - Smoke runner (backend ayakta olmali)
echo   all      - Backend + smoke
echo.
exit /b 0

:backend
echo [test.bat] Backend testleri...
cd md.service
python -m pytest tests -q --tb=short
set "EXIT=%ERRORLEVEL%"
cd ..
if %EXIT% neq 0 (
    echo.
    echo [HATA] Backend testleri basarisiz. Kod: %EXIT%
    exit /b %EXIT%
)
echo [OK] Backend testleri gecti.
exit /b 0

:e2e
echo [test.bat] E2E testleri...
echo UYARI: Backend (port 8000) ayakta olmali!
echo.
cd md.web
if not exist "node_modules" (
    echo npm install calistiriliyor...
    call npm install
    if errorlevel 1 (
        echo [HATA] npm install basarisiz
        cd ..
        exit /b 1
    )
)
where npx >nul 2>&1
if errorlevel 1 (
    echo [HATA] npx bulunamadi. Node.js kurulu mu?
    cd ..
    exit /b 1
)
call npx playwright install chromium 2>nul
call npm run test:e2e
set "EXIT=%ERRORLEVEL%"
cd ..
if %EXIT% neq 0 (
    echo.
    echo [HATA] E2E testleri basarisiz. Kod: %EXIT%
    echo Backend calisiyor mu? curl http://localhost:8000/health
    exit /b %EXIT%
)
echo [OK] E2E testleri gecti.
exit /b 0

:smoke
echo [test.bat] Smoke runner...
echo UYARI: Backend (port 8000) ayakta olmali!
echo.
python scripts/smoke.py
set "EXIT=%ERRORLEVEL%"
if %EXIT% neq 0 (
    echo.
    echo [HATA] Smoke basarisiz. Kod: %EXIT%
    echo Backend calisiyor mu? curl http://localhost:8000/health
    exit /b %EXIT%
)
echo [OK] Smoke gecti.
exit /b 0

:all
echo [test.bat] Backend + Smoke...
call "%~f0" backend
if errorlevel 1 exit /b 1
call "%~f0" smoke
exit /b %ERRORLEVEL%
