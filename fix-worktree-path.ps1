# Fix for Cursor "apply worktree to current branch" path error
# Cursor incorrectly uses c:\Users\Desktop\... instead of c:\Users\Sahjin\Desktop\...
# This script creates a junction so both paths resolve to the same location.
#
# RUN AS ADMINISTRATOR: Right-click PowerShell -> Run as administrator, then run:
#   & "C:\Users\Sahjin\Desktop\TPI-2026\TPI1\fix-worktree-path.ps1"

$junctionPath = "C:\Users\Desktop"
$targetPath = "C:\Users\Sahjin\Desktop"

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script must be run as Administrator." -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as admin:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell" -ForegroundColor White
    Write-Host "  2. Select 'Run as administrator'" -ForegroundColor White
    Write-Host "  3. Run: & '$PSCommandPath'" -ForegroundColor White
    exit 1
}

if (Test-Path $junctionPath) {
    $item = Get-Item $junctionPath -Force -ErrorAction SilentlyContinue
    if ($item -and $item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Write-Host "Junction already exists at $junctionPath" -ForegroundColor Green
        Write-Host "Target: $($item.Target)" -ForegroundColor Gray
        exit 0
    }
    Write-Host "Path exists but is not a junction. Remove it first or choose a different fix." -ForegroundColor Red
    exit 1
}

try {
    New-Item -ItemType Junction -Path $junctionPath -Target $targetPath -Force | Out-Null
    Write-Host "Success! Created junction:" -ForegroundColor Green
    Write-Host "  $junctionPath -> $targetPath" -ForegroundColor White
    Write-Host ""
    Write-Host "Cursor 'apply worktree to current branch' should now work." -ForegroundColor Green
} catch {
    Write-Host "Failed: $_" -ForegroundColor Red
    exit 1
}
