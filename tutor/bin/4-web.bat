@echo off
title Web dev server (port 5173)
rem This file is deliberately pure ASCII: cmd.exe parses batch files by byte
rem offset, so non-ASCII characters (or switching the code page mid-file) makes it mis-parse
rem the rest of the script. %USERPROFILE% expands at runtime, which avoids
rem hardcoding a user name that may contain non-ASCII characters.
set "DSH=%USERPROFILE%\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies"
set "PATH=%DSH%\node\bin;%PATH%"
cd /d "%~dp0..\tutor-web"
echo ==========================================
echo  Starting frontend  http://127.0.0.1:5173
echo  work dir: %CD%
echo ==========================================
echo.
echo  Admin console : http://127.0.0.1:5173/admin/login   (admin + deploy password)
echo  H5 mobile     : http://127.0.0.1:5173/h5
echo.
if not exist "%DSH%\node\bin\node.exe" (
  echo [ERROR] node.exe not found at:
  echo         %DSH%\node\bin\node.exe
  echo         Edit this file and fix the DSH path.
  pause >nul
  exit /b 1
)
"%DSH%\node\bin\node.exe" "%DSH%\pnpm\bin\pnpm.mjs" dev
echo.
echo Frontend stopped. Press any key to close.
pause >nul
