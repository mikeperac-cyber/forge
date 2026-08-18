<#
.SYNOPSIS
  Register (or remove) the two scheduled tasks that keep Forge running.

.DESCRIPTION
  Forge is a local-first app: the harvester reads your AI tools' histories from
  this machine's home directory, so the app has to run where those files are.
  This registers two tasks under your own account — no elevation, no service
  install, nothing system-wide:

    Forge Server   — `npm start` at logon, restarted if it falls over
    Forge Harvest  — `npm run harvest` every 30 minutes

  Everything is reversible with -Uninstall.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows-tasks.ps1
  powershell -ExecutionPolicy Bypass -File scripts\windows-tasks.ps1 -Uninstall
#>
param(
  [switch]$Uninstall,
  [int]$HarvestMinutes = 30
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$ServerTask = "Forge Server"
$HarvestTask = "Forge Harvest"

function Remove-IfPresent([string]$Name) {
  $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
  if ($existing) {
    Unregister-ScheduledTask -TaskName $Name -Confirm:$false
    Write-Host "removed  $Name"
    return $true
  }
  return $false
}

if ($Uninstall) {
  $a = Remove-IfPresent $ServerTask
  $b = Remove-IfPresent $HarvestTask
  if (-not ($a -or $b)) { Write-Host "nothing to remove." }
  Write-Host "`nAny already-running server keeps going until you close it or reboot."
  return
}

# npm is a .cmd shim on Windows, so it has to be invoked through cmd.exe rather
# than started directly.
#
# Written the long way rather than with `?.` — that operator is PowerShell 7+,
# and this is meant to run under the `powershell` (5.1) that ships with Windows.
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) { throw "npm.cmd not found on PATH." }
$npm = $npmCommand.Source

if (-not (Test-Path (Join-Path $Root ".next"))) {
  Write-Warning "No production build found. Run 'npm run build' first, or the server task will fail."
}

Write-Host "project : $Root"
Write-Host "npm     : $npm`n"

# Replace rather than duplicate, so re-running this is safe.
Remove-IfPresent $ServerTask | Out-Null
Remove-IfPresent $HarvestTask | Out-Null

# ----------------------------------------------------------------- server
$serverAction = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c `"npm start`"" -WorkingDirectory $Root

$serverTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Keep it alive, and never let Windows stop it for running too long — a server
# is supposed to run indefinitely.
$serverSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $ServerTask -Action $serverAction `
  -Trigger $serverTrigger -Settings $serverSettings `
  -Description "Forge — production server on http://localhost:3000" | Out-Null
Write-Host "created  $ServerTask        (at logon)"

# ---------------------------------------------------------------- harvest
$harvestAction = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c `"npm run harvest`"" -WorkingDirectory $Root

# Repeats forever from logon. A harvest is idempotent and skips unchanged
# transcripts by mtime, so running it often costs almost nothing.
$harvestTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$harvestTrigger.Repetition = (New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Minutes $HarvestMinutes) `
  -RepetitionDuration ([TimeSpan]::MaxValue)).Repetition

$harvestSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
  -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $HarvestTask -Action $harvestAction `
  -Trigger $harvestTrigger -Settings $harvestSettings `
  -Description "Forge — read AI tool histories into the activity ledger" | Out-Null
Write-Host "created  $HarvestTask       (every $HarvestMinutes min)"

Write-Host "`nStart them now without logging out:"
Write-Host "  Start-ScheduledTask -TaskName '$ServerTask'"
Write-Host "  Start-ScheduledTask -TaskName '$HarvestTask'"
Write-Host "`nRemove both:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\windows-tasks.ps1 -Uninstall"
