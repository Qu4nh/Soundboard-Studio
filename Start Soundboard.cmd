@echo off
cd /d "%~dp0"
if not exist "node_modules\electron\package.json" (
  echo Please run npm ci first.
  pause
  exit /b 1
)
if not exist "dist\index.html" call npm.cmd run build
node scripts\launch.cjs
