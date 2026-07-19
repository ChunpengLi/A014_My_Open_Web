@echo off
setlocal

set "REPO_URL=https://github.com/ChunpengLi/A014_My_Open_Web.git"
set "BRANCH=main"

cd /d "%~dp0"

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Git is not installed or not available in PATH.
  pause
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
  echo [INFO] Initializing Git repository...
  git init
  if errorlevel 1 goto :fail
)

git branch -M %BRANCH%
if errorlevel 1 goto :fail

git remote get-url origin >nul 2>nul
if errorlevel 1 (
  echo [INFO] Adding GitHub remote: %REPO_URL%
  git remote add origin "%REPO_URL%"
) else (
  echo [INFO] Updating GitHub remote: %REPO_URL%
  git remote set-url origin "%REPO_URL%"
)
if errorlevel 1 goto :fail

echo [INFO] Running local check...
call npm run check
if errorlevel 1 goto :fail

git status --short

for /f %%i in ('git status --porcelain') do set "HAS_CHANGES=1"
if defined HAS_CHANGES (
  echo [INFO] Committing local changes...
  git add .
  if errorlevel 1 goto :fail
  git commit -m "Update website"
  if errorlevel 1 goto :fail
) else (
  echo [INFO] No local changes to commit.
)

echo [INFO] Pushing to GitHub...
git push -u origin %BRANCH%
if errorlevel 1 goto :fail

echo.
echo [OK] Push complete.
echo GitHub: https://github.com/ChunpengLi/A014_My_Open_Web
pause
exit /b 0

:fail
echo.
echo [ERROR] Push failed. Check the message above.
pause
exit /b 1
