# Watchdog that keeps the dev-team pipeline going overnight.
# Every $IntervalMinutes it checks docs/STATUS.md. If tasks are still open and the file has not
# changed for $StaleHours (the interactive session died or is stuck), it runs a headless
# `claude --continue -p "/resume"` in this repo. Stops by itself when every task is done.
# Start:  powershell -ExecutionPolicy Bypass -File scripts\claude-watchdog.ps1
# Stop:   close its window, or Stop-Process the powershell running it. Log: scripts\claude-watchdog.log
param(
  [int]$IntervalMinutes = 60,
  [double]$StaleHours = 3
)

$repo = Split-Path -Parent $PSScriptRoot
$status = Join-Path $repo 'docs\STATUS.md'
$log = Join-Path $PSScriptRoot 'claude-watchdog.log'

function Write-Log([string]$msg) {
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg" | Out-File -FilePath $log -Append -Encoding utf8
}

# Task rows look like "| 6 | ... | owner | state |"; a task is open when its state is not "done".
function Get-OpenTasks {
  Get-Content $status | Where-Object { $_ -match '^\|\s*\d+\s*\|' } | Where-Object {
    $cells = $_.Trim('|').Split('|')
    -not $cells[-1].Trim().StartsWith('done')
  }
}

Write-Log "watchdog started (every $IntervalMinutes min, stale after $StaleHours h)"
while ($true) {
  $open = @(Get-OpenTasks)
  if ($open.Count -eq 0) {
    Write-Log 'all tasks done, exiting'
    break
  }
  $age = (Get-Date) - (Get-Item $status).LastWriteTime
  if ($age.TotalHours -ge $StaleHours) {
    Write-Log "$($open.Count) open task(s), STATUS.md idle for $([math]::Round($age.TotalHours, 1)) h -> running /resume"
    Push-Location $repo
    try {
      & claude --continue -p '/resume' --permission-mode auto 2>&1 | Out-File -FilePath $log -Append -Encoding utf8
      Write-Log "claude exited with code $LASTEXITCODE"
    } finally {
      Pop-Location
    }
  }
  Start-Sleep -Seconds ($IntervalMinutes * 60)
}
