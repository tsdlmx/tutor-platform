@echo off
title MySQL (port 3307)
echo ==========================================
echo  Starting MySQL   port 3307
echo  data dir: E:\dsh-dev\mysql-data
echo ==========================================
echo.
echo  Keep this window OPEN while using the platform.
echo.
"E:\dsh-dev\mysql\mysql-8.0.28-winx64\bin\mysqld.exe" --defaults-file=E:\dsh-dev\my.ini --console
echo.
echo MySQL stopped. Press any key to close.
pause >nul
