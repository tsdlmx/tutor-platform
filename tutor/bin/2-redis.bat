@echo off
title Redis (port 6379)
echo ==========================================
echo  Starting Redis   port 6379
echo ==========================================
echo.
echo  Keep this window OPEN while using the platform.
echo.
"E:\dsh-dev\redis\redis-server.exe" "E:\dsh-dev\redis\redis.windows.conf" --dir "E:\dsh-dev\redis"
echo.
echo Redis stopped. Press any key to close.
pause >nul
