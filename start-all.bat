@echo off
setlocal
title Start the tutor platform
echo ============================================================
echo  Tutor platform - one click start
echo ------------------------------------------------------------
echo  Opens 4 windows:  MySQL(3307)  Redis(6379)
echo                    Backend(12501)  Web(4173)
echo  Starts the Go Web API in the background when data\go-api.env
echo  exists (port 12502 unless that file says otherwise).
echo  Keep those windows open; closing one stops that service.
echo ============================================================
echo.

echo [1/4] MySQL ...
start "tutor-mysql-3307" cmd /c ""%~dp01-mysql.bat""
call :sleep 8

echo [2/4] Redis ...
start "tutor-redis-6379" cmd /c ""%~dp02-redis.bat""
call :sleep 5

echo [3/4] Backend - first start takes 20-40 seconds ...
start "tutor-backend-12501" cmd /c ""%~dp03-backend.bat""
call :sleep 34

rem Optional, exactly like bin-linux/0-start-all.sh: no data\go-api.env means no
rem Go service, so a plain Java-only deployment keeps working unchanged.
if exist "%~dp0data\go-api.env" (
  echo [3b] Go Web API ...
  call "%~dp03b-go-api.bat"
  if errorlevel 1 (
    echo.
    echo [ERROR] the Go Web API did not start. Fix data\go-api.env or rerun
    echo         3b-go-api.bat alone to read the full log.
    pause
    exit /b 1
  )
) else (
  echo [3b] Go Web API skipped - no data\go-api.env
)

echo [4/4] Web frontend ...
start "tutor-web-4173" cmd /c ""%~dp04-web.bat""
call :sleep 12

echo.
echo Checking ports ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(3307,6379,12501,4173); if (Test-Path '%~dp0data\go-api.env') { $ports += 12502 }; foreach($k in $ports){ $c=Get-NetTCPConnection -LocalPort $k -State Listen -ErrorAction SilentlyContinue; if($c){ Write-Host ('  OK   port ' + $k + ' is listening') } else { Write-Host ('  WARN port ' + $k + ' is NOT listening - check its window') } }"

echo.
echo Opening browser ...
start "" "http://127.0.0.1:4173/admin/login"
echo.
echo Login: admin + deploy password
echo.
echo Press any key to close this launcher (services keep running).
pause >nul
exit /b 0

rem Use ping instead of timeout: timeout fails when stdin is redirected,
rem which keeps this launcher usable from scripts too.
:sleep
ping -n %1 127.0.0.1 >nul
exit /b 0
