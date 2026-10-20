@echo off
setlocal
set "PKG=%~dp0"
if "%PKG:~-1%"=="\" set "PKG=%PKG:~0,-1%"
set "NODE=%PKG%\runtime\node\bin\node.exe"
set "WEB=%PKG%\tutor\tutor-web"
set "VITE=%WEB%\node_modules\vite\bin\vite.js"
title Web (port 4173)

if not exist "%NODE%" (
  echo [ERROR] node.exe not found at:
  echo         %NODE%
  pause >nul
  exit /b 1
)
if not exist "%VITE%" (
  echo [ERROR] vite not found. Run "npm-install.bat" first, or re-extract the package.
  echo         looked for: %VITE%
  pause >nul
  exit /b 1
)

cd /d "%WEB%"
echo ============================================================
echo  Web frontend   http://127.0.0.1:4173
echo  serving the production build in tutor-web\dist
echo ============================================================
echo.
echo  Admin console : http://127.0.0.1:4173/admin/login   (admin + deploy password)
echo  H5 mobile     : http://127.0.0.1:4173/h5
echo.
"%NODE%" "%VITE%" preview --mode production
echo.
echo Web stopped. Press any key to close.
pause >nul
