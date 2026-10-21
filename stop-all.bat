@echo off
setlocal
title Stop the tutor platform
echo ============================================================
echo  Stopping services by PORT
echo  (not by image name, so unrelated node/other programs
echo   running on this machine are left alone)
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$m=[ordered]@{'4173'='Web (vite preview)';'12501'='Go Web API';'6379'='Redis';'3307'='MySQL'}; foreach($k in $m.Keys){ $c=Get-NetTCPConnection -LocalPort ([int]$k) -State Listen -ErrorAction SilentlyContinue; if($c){ $seen=@{}; foreach($x in $c){ if(-not $seen[$x.OwningProcess]){ $seen[$x.OwningProcess]=1; Write-Host ('  stopping ' + $m[$k] + '  port ' + $k + '  PID ' + $x.OwningProcess); Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue } } } else { Write-Host ('  ' + $m[$k] + '  port ' + $k + ' was not running') } }"
rem The Go API also records its pid; drop the file so that the next
rem 3b-go-api.bat start does not mistake a stale pid for a running service.
if exist "%~dp0data\pids\go-api.pid" del /q "%~dp0data\pids\go-api.pid"
echo.
echo Done.
echo.
echo Press any key to close.
pause >nul
