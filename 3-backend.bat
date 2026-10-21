@echo off
setlocal
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"
set "JAVA_HOME=%PKG%\runtime\jdk8\jdk8u504-b01"
set "JAR=%PKG%\tutor\tutor-admin\target\tutor-admin.jar"
rem Upload dir. Passed as an environment variable on purpose: a "-Dxxx.yyy=zzz"
rem command line argument gets split at the first dot by some shells.
set "RUOYI_PROFILE=%PKG%\data\uploadPath"
set "JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8"
title Backend (port 12501)

if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [ERROR] java.exe not found at:
  echo         %JAVA_HOME%\bin\java.exe
  pause >nul
  exit /b 1
)
if not exist "%JAR%" (
  echo [ERROR] tutor-admin.jar not found at:
  echo         %JAR%
  pause >nul
  exit /b 1
)
if not exist "%RUOYI_PROFILE%" mkdir "%RUOYI_PROFILE%"

echo ============================================================
echo  Backend   http://127.0.0.1:12501   (server.port in application.yml)
echo  uploads : %RUOYI_PROFILE%
echo ============================================================
echo  Keep this window open while using the platform.
echo  First start takes 20-40 seconds.
echo.
"%JAVA_HOME%\bin\java.exe" -jar "%JAR%"
echo.
echo Backend stopped. Press any key to close.
pause >nul
