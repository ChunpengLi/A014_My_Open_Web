@echo off
setlocal

set "BUCKET_NAME=a014-my-open-web-uploads"

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or not available in PATH.
  pause
  exit /b 1
)

echo [INFO] Checking Cloudflare Wrangler login...
call npx wrangler whoami >nul 2>nul
if errorlevel 1 (
  echo [INFO] Wrangler is not logged in. A browser window will open for Cloudflare login.
  call npx wrangler login
  if errorlevel 1 goto :fail
)

echo [INFO] Creating R2 bucket: %BUCKET_NAME%
call npx wrangler r2 bucket create "%BUCKET_NAME%"
if errorlevel 1 (
  echo [WARN] Bucket creation did not complete. It may already exist, or R2 billing/subscription is not enabled.
  echo [INFO] Listing current R2 buckets...
  call npx wrangler r2 bucket list
  if errorlevel 1 goto :fail
) else (
  echo [OK] R2 bucket created: %BUCKET_NAME%
)

echo.
echo Next in Cloudflare Dashboard:
echo Workers ^& Pages -^> a014-my-open-web -^> Settings -^> Bindings -^> Add binding
echo Binding type: R2 bucket
echo Variable name: UPLOADS
echo Bucket: %BUCKET_NAME%
echo.
echo Then run migrate_uploads_to_r2.cmd to move the zip package's uploads/ files into R2.
echo.
pause
exit /b 0

:fail
echo.
echo [ERROR] R2 setup failed. Check the message above.
echo If Cloudflare asks you to enable R2 billing/subscription, finish that in the dashboard first.
pause
exit /b 1
