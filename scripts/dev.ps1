#requires -Version 5.1
<#
.SYNOPSIS
    Starts the dev stack: Go API + React console + React SSR site.

.DESCRIPTION
    One window, all logs, Ctrl+C stops everything.

    The API is BUILT to a temp binary and run directly rather than via `go run`,
    because `go run` spawns the compiled exe as a child: killing `go` leaves that
    child holding the port. Vite is likewise started as a plain node process
    instead of through npm, for the same reason.

    Database migrations are not run here — cmd/api applies pending ones on boot.

.PARAMETER ConsolePort
    Vite port. Must appear in CORS_ALLOWED_ORIGINS in src/backend/.env.
    The API port is not a parameter: HTTP_ADDR in src/backend/.env owns it, and
    the console + CORS are configured against that one value.

.PARAMETER Stop
    Kills whatever is listening on the three ports and exits. Use this to clear
    orphans left by a crashed run.

.PARAMETER SitePort
    Public React SSR site port (default 5373). The site binds to 127.0.0.1.

.EXAMPLE
    .\scripts\dev.ps1
.EXAMPLE
    .\scripts\dev.ps1 -Stop
.EXAMPLE
    .\scripts\dev.ps1 -SitePort 5374
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$ConsolePort = 5273,
    [ValidateRange(1, 65535)][int]$SitePort = 5373,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$BackendDir = Join-Path $Root 'src\backend'
$ConsoleDir = Join-Path $Root 'src\console'
$SiteDir = Join-Path $Root 'src\site'
$BuildDir = Join-Path $env:TEMP 'velt-dev'
$ApiExe = Join-Path $BuildDir 'velt-api.exe'

function Write-Step { param([string]$Message) Write-Host "  $Message" -ForegroundColor DarkGray }
function Write-Ok { param([string]$Message) Write-Host "  OK  $Message" -ForegroundColor Green }
function Fail {
    param([string]$Message, [string]$Fix)
    Write-Host "  !!  $Message" -ForegroundColor Red
    if ($Fix) { Write-Host "      $Fix" -ForegroundColor Yellow }
    exit 1
}

# Every PID listening on a port, IPv4 and IPv6 alike. Get-NetTCPConnection covers
# both stacks; `netstat -p tcp` does not, which is how a stale IPv6-only listener
# on the same port can masquerade as our dev server.
function Get-PortOwner {
    param([int]$Port)
    try {
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -Unique
    } catch {
        @()
    }
}

function Stop-Port {
    param([int]$Port, [string]$Label)
    $owners = @(Get-PortOwner -Port $Port)
    if ($owners.Count -eq 0) {
        Write-Step "$Label ($Port): nothing listening"
        return
    }
    foreach ($processId in $owners) {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        $name = if ($proc) { $proc.ProcessName } else { 'unknown' }
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Write-Ok "$Label ($Port): stopped $name (PID $processId)"
        } catch {
            # The owner may have exited between the port scan and the kill — the
            # run script tears down its sibling as soon as one child dies. Only
            # report a failure if it is genuinely still around.
            if (Get-Process -Id $processId -ErrorAction SilentlyContinue) {
                Write-Host "  !!  $Label ($Port): could not stop PID $processId" -ForegroundColor Red
            } else {
                Write-Step "$Label ($Port): already gone (PID $processId)"
            }
        }
    }
}

function Test-Tcp {
    param([string]$TargetHost, [int]$Port, [int]$TimeoutMs = 2000)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect($TargetHost, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Get-EnvValue {
    param([string]$Path, [string]$Key)
    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in Get-Content $Path) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $Matches[1].Trim()
        }
    }
    return $null
}

# ── -Stop ────────────────────────────────────────────────────────────────────
if ($Stop) {
    Write-Host "`nStopping velt dev stack" -ForegroundColor Cyan
    $addr = Get-EnvValue -Path (Join-Path $BackendDir '.env') -Key 'HTTP_ADDR'
    $stopApiPort = if ($addr -match ':(\d+)$') { [int]$Matches[1] } else { 8081 }
    Stop-Port -Port $stopApiPort -Label 'api'
    Stop-Port -Port $ConsolePort -Label 'console'
    Stop-Port -Port $SitePort -Label 'site'
    Write-Host ''
    exit 0
}

# ── Preflight ────────────────────────────────────────────────────────────────
Write-Host "`nvelt dev - preflight" -ForegroundColor Cyan

foreach ($tool in @(@{ Name = 'go'; Arg = 'version' }, @{ Name = 'node'; Arg = '--version' })) {
    if (-not (Get-Command $tool.Name -ErrorAction SilentlyContinue)) {
        Fail "$($tool.Name) not found on PATH" 'Install it, then reopen the terminal.'
    }
    # No 2>&1 here: in Windows PowerShell that wraps a native command's stderr in
    # ErrorRecords and trips $ErrorActionPreference even on a clean exit.
    $version = (& $tool.Name $tool.Arg | Select-Object -First 1)
    Write-Ok "$($tool.Name) $version"
}

$backendEnv = Join-Path $BackendDir '.env'
if (-not (Test-Path $backendEnv)) {
    Fail "missing src/backend/.env" "copy src\backend\.env.example to .env, then set DATABASE_URL, JWT_SECRET and ENCRYPTION_KEY."
}
$consoleEnv = Join-Path $ConsoleDir '.env.local'
if (-not (Test-Path $consoleEnv)) {
    Fail "missing src/console/.env.local" "create it with one line: VITE_API_BASE_URL=http://localhost:<api-port>/api"
}
Write-Ok 'env files present'

$addr = Get-EnvValue -Path $backendEnv -Key 'HTTP_ADDR'
$ApiPort = if ($addr -match ':(\d+)$') { [int]$Matches[1] } else { 8081 }
if ($ApiPort -eq $ConsolePort -or $ApiPort -eq $SitePort -or $ConsolePort -eq $SitePort) {
    Fail 'api, console and site must use different ports' 'adjust -ConsolePort, -SitePort or HTTP_ADDR in src\backend\.env.'
}

# The console talks to the API by absolute URL, and the API allow-lists the
# console origin. A mismatch here fails at runtime as an opaque CORS error, so
# surface it now.
$apiBase = Get-EnvValue -Path $consoleEnv -Key 'VITE_API_BASE_URL'
if ($apiBase -match ':(\d+)/' -and [int]$Matches[1] -ne $ApiPort) {
    Fail "console points at port $($Matches[1]) but the API runs on $ApiPort" "align VITE_API_BASE_URL in src\console\.env.local with HTTP_ADDR in src\backend\.env."
}
$cors = Get-EnvValue -Path $backendEnv -Key 'CORS_ALLOWED_ORIGINS'
if ($cors -and $cors -notmatch ":$ConsolePort(,|$)") {
    Fail "CORS_ALLOWED_ORIGINS does not include the console origin (port $ConsolePort)" "add http://localhost:$ConsolePort to CORS_ALLOWED_ORIGINS in src\backend\.env."
}
Write-Ok "ports api=$ApiPort console=$ConsolePort site=$SitePort, origins aligned"

$dbUrl = Get-EnvValue -Path $backendEnv -Key 'DATABASE_URL'
if ($dbUrl -match '@([^:/]+):(\d+)/') {
    $dbHost = $Matches[1]
    $dbPort = [int]$Matches[2]
    if (-not (Test-Tcp -TargetHost $dbHost -Port $dbPort)) {
        Fail "postgres unreachable at ${dbHost}:${dbPort}" "start postgres, or fix DATABASE_URL in src\backend\.env."
    }
    Write-Ok "postgres reachable at ${dbHost}:${dbPort}"
} else {
    Write-Step 'DATABASE_URL not in host:port form - skipping reachability check'
}

foreach ($p in @(@{ Port = $ApiPort; Label = 'api' }, @{ Port = $ConsolePort; Label = 'console' }, @{ Port = $SitePort; Label = 'site' })) {
    $owners = @(Get-PortOwner -Port $p.Port)
    if ($owners.Count -gt 0) {
        $names = ($owners | ForEach-Object {
                $proc = Get-Process -Id $_ -ErrorAction SilentlyContinue
                if ($proc) { "$($proc.ProcessName) (PID $_)" } else { "PID $_" }
            }) -join ', '
        $fix = if ($p.Label -eq 'api') {
            'run .\scripts\dev.ps1 -Stop, or change HTTP_ADDR in src\backend\.env.'
        } elseif ($p.Label -eq 'console') {
            'run .\scripts\dev.ps1 -Stop, or pass a different -ConsolePort.'
        } else {
            'run .\scripts\dev.ps1 -Stop, or pass a different -SitePort.'
        }
        Fail "port $($p.Port) ($($p.Label)) already in use by $names" $fix
    }
}
Write-Ok 'ports free'

foreach ($frontend in @(@{ Dir = $ConsoleDir; Label = 'console' }, @{ Dir = $SiteDir; Label = 'site' })) {
    if (-not (Test-Path (Join-Path $frontend.Dir 'package.json'))) {
        Fail "missing $($frontend.Label) package.json" "check $($frontend.Dir)."
    }
    if (-not (Test-Path (Join-Path $frontend.Dir 'node_modules'))) {
        Write-Step "installing $($frontend.Label) dependencies (first run)"
        Push-Location $frontend.Dir
        try {
            & npm.cmd install
            if ($LASTEXITCODE -ne 0) { Fail "$($frontend.Label) npm install failed" }
        } finally { Pop-Location }
    }
    Write-Ok "$($frontend.Label) dependencies present"
}

Write-Step 'building api'
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
Push-Location $BackendDir
try {
    & go build -o $ApiExe ./cmd/api
    if ($LASTEXITCODE -ne 0) { Fail 'go build failed' }
} finally { Pop-Location }
Write-Ok "api built -> $ApiExe"

# ── Run ──────────────────────────────────────────────────────────────────────
$api = $null
$web = $null
$site = $null
try {
    # -NoNewWindow keeps children attached to this console, so their logs
    # interleave here instead of hiding in separate windows.
    $api = Start-Process -FilePath $ApiExe -WorkingDirectory $BackendDir -NoNewWindow -PassThru
    $viteBin = Join-Path $ConsoleDir 'node_modules\vite\bin\vite.js'
    $web = Start-Process -FilePath 'node' `
        -ArgumentList ('"{0}"' -f $viteBin), '--port', $ConsolePort, '--strictPort' `
        -WorkingDirectory $ConsoleDir -NoNewWindow -PassThru

    # Scope site-only settings to process creation; API/console and the parent
    # shell retain their existing PORT/HOST values (PowerShell 5.1 compatible).
    $previousPort = $env:PORT
    $previousHost = $env:HOST
    try {
        $env:PORT = [string]$SitePort
        $env:HOST = '127.0.0.1'
        $site = Start-Process -FilePath 'node' -ArgumentList 'server.mjs' `
            -WorkingDirectory $SiteDir -NoNewWindow -PassThru
    } finally {
        $env:PORT = $previousPort
        $env:HOST = $previousHost
    }

    Write-Host ''
    Write-Host '  console  ' -NoNewline -ForegroundColor Cyan
    Write-Host "http://localhost:$ConsolePort"
    Write-Host '  site     ' -NoNewline -ForegroundColor Cyan
    Write-Host "http://127.0.0.1:$SitePort"
    Write-Host '  api      ' -NoNewline -ForegroundColor Cyan
    Write-Host "http://localhost:$ApiPort/api  (health: /healthz)"
    Write-Host '  stop     ' -NoNewline -ForegroundColor Cyan
    Write-Host 'Ctrl+C'
    Write-Host ''

    while ($true) {
        if ($api.HasExited) { Write-Host "`n  api exited (code $($api.ExitCode))" -ForegroundColor Red; break }
        if ($web.HasExited) { Write-Host "`n  console exited (code $($web.ExitCode))" -ForegroundColor Red; break }
        if ($site.HasExited) { Write-Host "`n  site exited (code $($site.ExitCode))" -ForegroundColor Red; break }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host "`n  shutting down" -ForegroundColor DarkGray
    foreach ($proc in @($api, $web, $site)) {
        if ($proc -and -not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    # Belt and braces: a child that outlived its parent still holds the port.
    Stop-Port -Port $ApiPort -Label 'api'
    Stop-Port -Port $ConsolePort -Label 'console'
    Stop-Port -Port $SitePort -Label 'site'
    Write-Host ''
}
