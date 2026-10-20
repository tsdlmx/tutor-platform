@echo off
setlocal
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"
set "REDIS=%PKG%\runtime\redis\redis-server.exe"
set "DATA=%PKG%\data\redis"
title Redis (port 6379)

if not exist "%REDIS%" (
  echo [ERROR] redis-server.exe not found at:
  echo         %REDIS%
  pause >nul
  exit /b 1
)
if not exist "%DATA%" mkdir "%DATA%"

echo ============================================================
echo  Redis   port 6379
echo ============================================================
echo  Keep this window open while using the platform.
echo.
"%REDIS%" --port 6379 --bind 127.0.0.1 --dir "%DATA%"
echo.
echo Redis stopped. Press any key to close.
pause >nul
