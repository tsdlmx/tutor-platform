@echo off
title Stop the tutor platform
echo ============================================================
echo  Stopping services by PORT
echo  (not by image name, so unrelated java/node programs
echo   running on this machine are left alone)
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$m=[ordered]@{5173='Frontend (Vite)';8080='Backend (Spring Boot)';6379='Redis';3307='MySQL'}; foreach($k in $m.Keys){ $c=Get-NetTCPConnection -LocalPort $k -State Listen -ErrorAction SilentlyContinue; if($c){ $seen=@{}; foreach($x in $c){ if(-not $seen[$x.OwningProcess]){ $seen[$x.OwningProcess]=1; Write-Host ('  stopping ' + $m[$k] + '  port ' + $k + '  PID ' + $x.OwningProcess); Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue } } } else { Write-Host ('  ' + $m[$k] + '  port ' + $k + ' was not running') } }"
echo.
echo Done.
echo.
echo Press any key to close.
pause >nul
