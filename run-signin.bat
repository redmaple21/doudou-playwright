@echo off
REM Auto Sign-in Batch Script
REM For Windows Task Scheduler

cd /d "%~dp0"

echo ========================================
echo Starting Auto Sign-in Task...
echo ========================================
echo.

node index.js

echo.
echo ========================================
echo Task Completed
echo ========================================

REM Uncomment the line below if you want to see the results
REM pause
