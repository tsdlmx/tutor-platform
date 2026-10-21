<#
  Start / stop the Go Web API on Windows.

  Windows counterpart of bin-linux/3b-go-api.sh:
    * reads data\go-api.env (never committed) and exports its KEY=VALUE lines
    * checks the PostgreSQL and Redis endpoints before starting
    * builds cmd/server + cmd/migrate with the local Go toolchain when present,
      otherwise requires runtime\tutor-api.exe and runtime\tutor-api-migrate.exe
    * runs the versioned migrations (idempotent: advisory lock + checksum), then
      starts the server detached with logs in data\logs and a pid in data\pids
    * waits for the listen port and then for /health/ready, so "started" really
      means PostgreSQL and Redis answered

  The port comes from HTTP_ADDR in data\go-api.env, because that is what the
  process actually binds; without it we default to 127.0.0.1:12502 (the same
  transition port the Linux script uses while Java still owns 12501). -Port
  forces a port and refuses to run when it contradicts the file.

  This file is ASCII-only on purpose: Windows PowerShell 5.1 decodes .ps1 files
  without a BOM as ANSI, so non-ASCII text would be mangled on CJK hosts. The
  Chinese notes live in README.md and docs/DEPLOYMENT.md instead.

  Usage:
    3b-go-api.bat                 start, or report that it is already running
    3b-go-api.bat -Port 12501     start on the post-switch (Go-only) port
    3b-go-api.bat -SkipBuild      reuse the existing binaries
    3b-go-api.bat -Stop           stop the process recorded in the pid file
#>
[CmdletBinding()]
param(
    [int]$Port = 0,
    [switch]$Stop,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
if (-not $Root) { $Root = Split-Path -Parent $MyInvocation.MyCommand.Path }

$Data = Join-Path $Root 'data'
$EnvFile = Join-Path $Data 'go-api.env'
$Logs = Join-Path $Data 'logs'
$PidDir = Join-Path $Data 'pids'
$Runtime = Join-Path $Root 'runtime'
$Source = Join-Path $Root 'tutor\tutor-api'
$Bin = Join-Path $Runtime 'tutor-api.exe'
$Migrate = Join-Path $Runtime 'tutor-api-migrate.exe'
$PidFile = Join-Path $PidDir 'go-api.pid'
$Log = Join-Path $Logs 'go-api.log'
$ErrLog = Join-Path $Logs 'go-api.err.log'

$StartupTimeoutSeconds = 60

function Write-Step([string]$Message) { Write-Host "  [..] $Message" }
function Write-Ok([string]$Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "  [WARN] $Message" -ForegroundColor Yellow }

function Fail([string]$Message) {
    Write-Host "  [FAIL] $Message" -ForegroundColor Red
    exit 1
}

function Show-LogTail([string]$Path, [int]$Lines = 40) {
    if (-not (Test-Path -LiteralPath $Path)) { return }
    Write-Host "  --- last $Lines lines of $Path ---"
    Get-Content -LiteralPath $Path -Tail $Lines -ErrorAction SilentlyContinue |
        ForEach-Object { Write-Host "  $_" }
}

# Native commands are invoked through this wrapper: with
# $ErrorActionPreference = 'Stop' a compiler writing to stderr can turn into a
# terminating error before we get to read $LASTEXITCODE ourselves.
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        # ForEach-Object keeps the child's own output going to the console
        # instead of being captured as this function's return value.
        & $Exe @Arguments 2>&1 | ForEach-Object { Write-Host "  $_" }
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Test-TcpPort([string]$TcpHost, [int]$TcpPort, [int]$TimeoutMs = 2000) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.ConnectAsync($TcpHost, $TcpPort)
        if (-not $task.Wait($TimeoutMs)) { return $false }
        return $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

# Accepts a URL DSN (postgres://user:pass@host:port/db?sslmode=...), a bare
# host:port (REDIS_ADDR), or the key=value DSN form GORM also understands.
function Split-HostPort([string]$Value, [int]$DefaultPort) {
    $result = @{ Host = '127.0.0.1'; Port = $DefaultPort }
    if (-not $Value) { return $result }
    $text = $Value.Trim()

    if ($text -match '^[a-zA-Z][a-zA-Z0-9+.\-]*://') {
        $match = [regex]::Match($text, '^[a-zA-Z][a-zA-Z0-9+.\-]*://(?:[^@/?#]*@)?(\[[^\]]+\]|[^/?#:]+)(?::(\d+))?')
        if ($match.Success) {
            $result.Host = $match.Groups[1].Value.Trim('[', ']')
            if ($match.Groups[2].Success -and $match.Groups[2].Value) {
                $result.Port = [int]$match.Groups[2].Value
            }
        }
        return $result
    }

    if ($text -match '^(\[[^\]]+\]|[^:]+):(\d+)$') {
        $result.Host = $Matches[1].Trim('[', ']')
        $result.Port = [int]$Matches[2]
        return $result
    }

    if ($text -match 'host\s*=\s*([^ ;]+)') { $result.Host = $Matches[1] }
    if ($text -match 'port\s*=\s*(\d+)') { $result.Port = [int]$Matches[1] }
    return $result
}

function Read-EnvFile([string]$Path) {
    $values = @{}
    foreach ($raw in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $line = $raw.Trim()
        if ($line -eq '' -or $line.StartsWith('#')) { continue }
        if ($line -match '^export\s+') { $line = $line.Substring(7) }
        $separator = $line.IndexOf('=')
        if ($separator -lt 1) { continue }
        $key = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        if ($key) { $values[$key] = $value }
    }
    return $values
}

function Get-PortOwner([int]$TargetPort) {
    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        $connection = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($connection) {
            $name = ''
            $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            if ($process) { $name = $process.ProcessName }
            return ("pid {0} ({1})" -f $connection.OwningProcess, $name)
        }
        return $null
    }
    $line = netstat -ano | Select-String -Pattern ":$TargetPort\s" | Select-String -Pattern 'LISTENING' |
        Select-Object -First 1
    if (-not $line) { return $null }
    $match = [regex]::Match($line.ToString(), '(\d+)\s*$')
    if ($match.Success) { return "pid $($match.Groups[1].Value)" }
    return 'an unknown process'
}

function Get-RecordedPid {
    if (-not (Test-Path -LiteralPath $PidFile)) { return 0 }
    $raw = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    $recorded = 0
    if ($raw -and [int]::TryParse($raw.Trim(), [ref]$recorded)) { return $recorded }
    return 0
}

New-Item -ItemType Directory -Force -Path $Logs, $PidDir | Out-Null

Write-Host ''
Write-Host '=== Go Web API (Windows) ==='

# --------------------------------------------------------------------------
# -Stop
# --------------------------------------------------------------------------
if ($Stop) {
    $recorded = Get-RecordedPid
    if ($recorded -gt 0) {
        $process = Get-Process -Id $recorded -ErrorAction SilentlyContinue
        if ($process) {
            Stop-Process -Id $recorded -Force
            Write-Ok "stopped pid $recorded"
        } else {
            Write-Step "pid $recorded is not running any more"
        }
    } else {
        Write-Step 'no pid file, nothing recorded as running'
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue

    if ($Port -gt 0) {
        $owner = Get-PortOwner $Port
        if ($owner) {
            Write-Warn "port $Port is still held by $owner"
            Write-Warn "stop it with: stop-all.bat, or kill that pid manually"
        } else {
            Write-Ok "port $Port is free"
        }
    }
    Write-Host ''
    exit 0
}

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------
if (-not (Test-Path -LiteralPath $EnvFile)) {
    Write-Host "  [FAIL] $EnvFile not found" -ForegroundColor Red
    Write-Host '         Copy tutor\tutor-api\.env.example to data\go-api.env and fill in the real values.'
    Write-Host '         That file holds DATABASE_DSN and JWT_SECRET: never commit it.'
    exit 1
}

$envValues = Read-EnvFile $EnvFile
foreach ($key in $envValues.Keys) {
    [Environment]::SetEnvironmentVariable($key, $envValues[$key], 'Process')
}
Write-Ok "loaded $($envValues.Count) settings from data\go-api.env"

foreach ($required in 'DATABASE_DSN', 'JWT_SECRET', 'REDIS_ADDR') {
    if (-not [Environment]::GetEnvironmentVariable($required, 'Process')) {
        Fail "data\go-api.env is missing $required"
    }
}

$httpAddr = ''
if ([Environment]::GetEnvironmentVariable('HTTP_ADDR', 'Process')) {
    $httpAddr = [Environment]::GetEnvironmentVariable('HTTP_ADDR', 'Process').Trim()
}

if ($Port -gt 0) {
    if ($httpAddr -and $httpAddr -notmatch ":$Port$") {
        Fail "HTTP_ADDR=$httpAddr in data\go-api.env contradicts -Port $Port; fix one of them"
    }
    if (-not $httpAddr) { $httpAddr = "127.0.0.1:$Port" }
} elseif ($httpAddr) {
    $portMatch = [regex]::Match($httpAddr, ':(\d+)$')
    if (-not $portMatch.Success) { Fail "cannot read a port from HTTP_ADDR=$httpAddr" }
    $Port = [int]$portMatch.Groups[1].Value
} else {
    $Port = 12502
    $httpAddr = "127.0.0.1:$Port"
    Write-Warn "HTTP_ADDR is not set in data\go-api.env; binding 127.0.0.1:$Port"
}

[Environment]::SetEnvironmentVariable('HTTP_ADDR', $httpAddr, 'Process')

$probeHost = ($httpAddr -replace ':(\d+)$', '')
if (-not $probeHost -or $probeHost -eq '0.0.0.0' -or $probeHost -eq '::' -or $probeHost -eq '[::]') {
    $probeHost = '127.0.0.1'
}
$probeHost = $probeHost.Trim('[', ']')

if ($Port -eq 12501) {
    Write-Warn 'binding 12501: this is the Java port during the transition, so stop Java first (stop-all.bat)'
}

# --------------------------------------------------------------------------
# Already running?
# --------------------------------------------------------------------------
$runningPid = Get-RecordedPid
if ($runningPid -gt 0 -and (Get-Process -Id $runningPid -ErrorAction SilentlyContinue)) {
    Write-Ok "Go Web API is already running (pid $runningPid, $httpAddr)"
    Write-Host ''
    exit 0
}
Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue

# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------
$pg = Split-HostPort ([Environment]::GetEnvironmentVariable('DATABASE_DSN', 'Process')) 5432
if (-not (Test-TcpPort $pg.Host $pg.Port)) {
    Fail "PostgreSQL ($($pg.Host):$($pg.Port)) is not reachable - start it first, then run this script again"
}

$redis = Split-HostPort ([Environment]::GetEnvironmentVariable('REDIS_ADDR', 'Process')) 6379
if (-not (Test-TcpPort $redis.Host $redis.Port)) {
    Fail "Redis ($($redis.Host):$($redis.Port)) is not reachable - run 2-redis.bat first"
}
Write-Ok "PostgreSQL $($pg.Host):$($pg.Port), Redis $($redis.Host):$($redis.Port)"

# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------
$haveBinaries = (Test-Path -LiteralPath $Bin) -and (Test-Path -LiteralPath $Migrate)
$go = Get-Command go -ErrorAction SilentlyContinue

if ($SkipBuild) {
    Write-Step 'build skipped (-SkipBuild)'
    if (-not $haveBinaries) {
        Fail "no prebuilt binary: $Bin and $Migrate are required when the build is skipped"
    }
} elseif ($go) {
    Write-Step "building with $($go.Source)"
    New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
    Push-Location $Source
    try {
        $buildCode = Invoke-Native $go.Source @('build', '-trimpath', '-o', $Bin, './cmd/server')
        if ($buildCode -eq 0) {
            $buildCode = Invoke-Native $go.Source @('build', '-trimpath', '-o', $Migrate, './cmd/migrate')
        }
    } finally {
        Pop-Location
    }
    if ($buildCode -ne 0) {
        if ($haveBinaries) {
            Write-Warn 'go build failed; falling back to the binaries already in runtime\'
        } else {
            Fail 'go build failed and there is no prebuilt binary. go.mod pins toolchain go1.26.9 (known stdlib CVEs in older releases); install Go 1.26.9+ or build on another machine.'
        }
    } else {
        Write-Ok 'build finished'
    }
} elseif ($haveBinaries) {
    Write-Step 'no Go toolchain; reusing runtime\tutor-api.exe'
} else {
    Fail "no Go toolchain and no prebuilt binary. Build on a machine with Go 1.26.9+ and copy runtime\tutor-api*.exe over, or install Go."
}

# --------------------------------------------------------------------------
# Migrate
# --------------------------------------------------------------------------
Write-Step 'applying versioned migrations'
$migrateCode = Invoke-Native $Migrate @()
if ($migrateCode -ne 0) {
    Fail 'database migration failed (see the JSON lines above; DATABASE_DSN must point at the real database)'
}
Write-Ok 'migrations applied'

# --------------------------------------------------------------------------
# Start
# --------------------------------------------------------------------------
$owner = Get-PortOwner $Port
if ($owner) {
    Fail "port $Port is already in use by $owner - stop it (stop-all.bat) or pick another port"
}

if (Test-Path -LiteralPath $Log) {
    Move-Item -LiteralPath $Log -Destination "$Log.prev" -Force
}
if (Test-Path -LiteralPath $ErrLog) {
    Move-Item -LiteralPath $ErrLog -Destination "$ErrLog.prev" -Force
}

# Hidden + redirected: the process detaches from this console, so closing the
# window (or the caller, e.g. start-all.bat) does not stop the service.
$server = Start-Process -FilePath $Bin -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $Log -RedirectStandardError $ErrLog
Set-Content -LiteralPath $PidFile -Value $server.Id -Encoding ASCII
Write-Ok "started pid $($server.Id), log data\logs\go-api.log"

$deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
while (-not (Test-TcpPort $probeHost $Port 500)) {
    $server.Refresh()
    if ($server.HasExited) {
        Write-Host "  [FAIL] process exited with code $($server.ExitCode) before listening on ${probeHost}:$Port" -ForegroundColor Red
        Show-LogTail $Log
        Show-LogTail $ErrLog
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    if ((Get-Date) -gt $deadline) {
        Write-Host "  [FAIL] ${probeHost}:$Port did not open within $StartupTimeoutSeconds s" -ForegroundColor Red
        Show-LogTail $Log
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
    Start-Sleep -Milliseconds 500
}

# An open port is not the same as a healthy service: /health/ready probes
# PostgreSQL and Redis, which is the check that matters after a restart.
$ready = Test-TcpPort $probeHost $Port 1000
if ($ready) {
    try {
        Invoke-RestMethod -Uri "http://${probeHost}:$Port/health/ready" -TimeoutSec 5 -Method Get | Out-Null
        Write-Ok "/health/ready"
    } catch {
        Write-Host '  [FAIL] /health/ready did not pass (PostgreSQL or Redis unavailable)' -ForegroundColor Red
        Show-LogTail $Log
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

Write-Host ''
Write-Host "  Go Web API ready on http://${probeHost}:$Port"
Write-Host '  Point the frontend proxies at it (tutor\tutor-web\.env.production):'
Write-Host "    VITE_WEB_API_PROXY_TARGET=http://127.0.0.1:$Port"
Write-Host "    VITE_ADMIN_API_PROXY_TARGET=http://127.0.0.1:$Port"
Write-Host '  Stop it with:  3b-go-api.bat -Stop   (or stop-all.bat)'
Write-Host "  Logs:          data\logs\go-api.log"
Write-Host '  Go-only switch: set HTTP_ADDR=127.0.0.1:12501 in data\go-api.env, stop Java, restart.'
Write-Host ''
exit 0
