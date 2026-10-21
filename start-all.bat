@echo off
setlocal
title Start the tutor platform
echo ============================================================
echo  Tutor platform - one click start
echo ------------------------------------------------------------
echo  Opens 3 windows:  MySQL(3307)  Redis(6379)  Web(4173)
echo  Starts the Go Web API in the background (port 12501 unless
echo  data\go-api.env says otherwise). The Java backend has been
echo  removed; get it back with: git checkout legacy-java-final
echo  Keep those windows open; closing one stops that service.
echo ============================================================
echo.

echo [1/3] MySQL (legacy data source) ...
start "tutor-mysql-3307" cmd /c ""%~dp01-mysql.bat""
call :sleep 8

echo [2/3] Redis ...
start "tutor-redis-6379" cmd /c ""%~dp02-redis.bat""
call :sleep 5

if exist "%~dp0data\go-api.env" (
  echo [3/3a] Go Web API ...
  call "%~dp03b-go-api.bat"
  if errorlevel 1 (
    echo.
    echo [ERROR] the Go Web API did not start. Fix data\go-api.env or rerun
    echo         3b-go-api.bat alone to read the full log.
    pause
    exit /b 1
  )
) else (
  echo [3/3a] Go Web API skipped - no data\go-api.env
  echo         copy tutor\tutor-api\.env.example to data\go-api.env and fill it in
)

echo [3/3b] Web frontend ...
start "tutor-web-4173" cmd /c ""%~dp04-web.bat""
call :sleep 12

echo.
echo Checking ports ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports = @(3307,6379,4173); if (Test-Path '%~dp0data\go-api.env') { $ports += 12501 }; foreach($k in $ports){ $c=Get-NetTCPConnection -LocalPort $k -State Listen -ErrorAction SilentlyContinue; if($c){ Write-Host ('  OK   port ' + $k + ' is listening') } else { Write-Host ('  WARN port ' + $k + ' is NOT listening - check its window') } }"

echo.
echo Opening browser ...
start "" "http://127.0.0.1:4173/admin/login"
echo.
echo Login: see your deployment record
echo.
echo Press any key to close this launcher (services keep running).
pause >nul
exit /b 0

rem Use ping instead of timeout: timeout fails when stdin is redirected,
rem which keeps this launcher usable from scripts too.
:sleep
ping -n %1 127.0.0.1 >nul
exit /b 0
