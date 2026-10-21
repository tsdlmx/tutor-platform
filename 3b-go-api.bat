@echo off
rem ============================================================================
rem 3b) Start the Go Web API (the migrated backend) on Windows.
rem ----------------------------------------------------------------------------
rem Windows counterpart of bin-linux/3b-go-api.sh. All of the work happens in
rem 3b-go-api.ps1 next to this file; this launcher only picks a PowerShell host
rem so the script can be double-clicked.
rem
rem   Configuration : data\go-api.env   (never commit it, see .gitignore)
rem   Listen        : HTTP_ADDR from that file, else 127.0.0.1:12502
rem   Logs / pid    : data\logs\go-api.log, data\pids\go-api.pid
rem
rem Usage:
rem   3b-go-api.bat                 start (or report it is already running)
rem   3b-go-api.bat -Port 12501     start on the post-switch Go-only port
rem   3b-go-api.bat -SkipBuild      reuse runtime\tutor-api.exe
rem   3b-go-api.bat -Stop           stop
rem ============================================================================
setlocal
set "PS=powershell.exe"
where pwsh.exe >nul 2>nul && set "PS=pwsh.exe"

rem Double-clicked? Explorer runs: cmd /c ""<path>\3b-go-api.bat" ", so our own
rem name shows up in cmdcmdline. The result is consumed through `if defined`
rem below, because %cmdcmdline% inside a parenthesised block would be expanded
rem too early. Scripts that `call` this file (start-all.bat) do not match, so
rem they are never blocked on the pause.
set "LAUNCHED_INTERACTIVE="
echo %cmdcmdline% | find /i "%~nx0" >nul && set "LAUNCHED_INTERACTIVE=1"

"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp03b-go-api.ps1" %*
if errorlevel 1 (
  echo.
  echo [FAILED] the Go Web API was not started; see the messages above.
  if defined LAUNCHED_INTERACTIVE pause >nul
  exit /b 1
)
if defined LAUNCHED_INTERACTIVE pause >nul
exit /b 0
