@echo off
REM Fix for Cursor "apply worktree to current branch" path error
REM RIGHT-CLICK THIS FILE -> Run as administrator

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo This script must be run as Administrator.
    echo.
    echo Right-click fix-worktree-path.bat and select "Run as administrator"
    pause
    exit /b 1
)

if exist "C:\Users\Desktop" (
    echo C:\Users\Desktop already exists.
    echo If it is a junction, you are already fixed. Otherwise, remove it first.
    pause
    exit /b 1
)

mklink /J "C:\Users\Desktop" "C:\Users\Sahjin\Desktop"
if %errorLevel% equ 0 (
    echo.
    echo Success! Junction created.
    echo C:\Users\Desktop now points to your Desktop.
    echo.
    echo Cursor "apply worktree to current branch" should now work.
) else (
    echo Failed to create junction.
)
pause
