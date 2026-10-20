@echo off
title Backend Spring Boot (port 8080)
set "JAVA_HOME=E:\dsh-dev\jdk8\jdk8u504-b01"
rem JVM options are passed through the JAVA_TOOL_OPTIONS environment variable
rem on purpose: a "-Dxxx.yyy=zzz" command line argument gets split at the
rem first dot by some shells, which then fails with
rem "Could not find or load main class .encoding=UTF-8".
set "JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8"
cd /d "%~dp0.."
echo ==========================================
echo  Starting backend  http://127.0.0.1:8080
echo  work dir: %CD%
echo ==========================================
echo.
"%JAVA_HOME%\bin\java.exe" -jar "tutor-admin\target\tutor-admin.jar"
echo.
echo Backend stopped. Press any key to close.
pause >nul
