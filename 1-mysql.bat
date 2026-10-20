@echo off
setlocal
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"
set "MYSQL=%PKG%\runtime\mysql\mysql-8.0.28-winx64"
set "DATA=%PKG%\data\mysql"
title MySQL (port 3307)

if not exist "%MYSQL%\bin\mysqld.exe" (
  echo [ERROR] mysqld.exe not found at:
  echo         %MYSQL%\bin\mysqld.exe
  pause >nul
  exit /b 1
)
if not exist "%DATA%" (
  echo [ERROR] data dir not found: %DATA%
  echo         Extract the whole package, do not move folders around.
  pause >nul
  exit /b 1
)

echo ============================================================
echo  MySQL   port 3307
echo  basedir : %MYSQL%
echo  datadir : %DATA%
echo ============================================================
echo  Keep this window open while using the platform.
echo.
"%MYSQL%\bin\mysqld.exe" --basedir="%MYSQL%" --datadir="%DATA%" --port=3307 --bind-address=127.0.0.1 --character-set-server=utf8mb4 --collation-server=utf8mb4_general_ci --default-authentication-plugin=mysql_native_password --log-error="%DATA%\error.log" --console
echo.
echo MySQL stopped. Press any key to close.
pause >nul
