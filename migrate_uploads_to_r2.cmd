@echo off
setlocal

set "BUCKET_NAME=a014-my-open-web-uploads"
set "ZIP_FILE=Firmware_Manage_Web_public.zip"
set "EXTRACT_DIR=tmp\r2-uploads"

cd /d "%~dp0"

if not exist "%ZIP_FILE%" (
  echo [ERROR] Cannot find %ZIP_FILE%.
  pause
  exit /b 1
)

call npx wrangler whoami >nul 2>nul
if errorlevel 1 (
  echo [INFO] Wrangler is not logged in. A browser window will open for Cloudflare login.
  call npx wrangler login
  if errorlevel 1 goto :fail
)

echo [INFO] Extracting uploads/ from %ZIP_FILE% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$root=(Resolve-Path '.').Path;" ^
  "$extract=Join-Path $root '%EXTRACT_DIR%';" ^
  "New-Item -ItemType Directory -Force -Path $extract | Out-Null;" ^
  "Add-Type -AssemblyName System.IO.Compression.FileSystem;" ^
  "$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $root '%ZIP_FILE%'));" ^
  "try { foreach($entry in $zip.Entries) { if($entry.FullName -match '^Firmware_Manage_Web/uploads/' -and $entry.Length -gt 0) { $rel=$entry.FullName -replace '^Firmware_Manage_Web/uploads/',''; $target=Join-Path $extract $rel; New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null; [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$true) } } } finally { $zip.Dispose() }"
if errorlevel 1 goto :fail

echo [INFO] Uploading files to R2 bucket: %BUCKET_NAME%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$base=(Resolve-Path '%EXTRACT_DIR%').Path;" ^
  "$files=Get-ChildItem -LiteralPath $base -Recurse -File;" ^
  "$total=$files.Count; $i=0;" ^
  "foreach($file in $files) { $i++; $rel=$file.FullName.Substring($base.Length).TrimStart('\','/').Replace('\','/'); $key='uploads/' + $rel; Write-Host ('[{0}/{1}] {2}' -f $i,$total,$key); & npx wrangler r2 object put ('%BUCKET_NAME%/' + $key) --file $file.FullName; if($LASTEXITCODE -ne 0){ exit $LASTEXITCODE } }"
if errorlevel 1 goto :fail

echo.
echo [OK] Upload migration complete.
pause
exit /b 0

:fail
echo.
echo [ERROR] R2 upload migration failed. Check the message above.
pause
exit /b 1
