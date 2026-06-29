@echo off
title GitHub Repository Setup Helper
echo ===================================================
echo   IntelliHire GitHub Repository Deploy Helper
echo ===================================================
echo.
echo This script will help you push your project to GitHub.
echo.
set /p repo_url="Enter your GitHub Repository URL (e.g., https://github.com/username/repo.git): "
if "%repo_url%"=="" (
    echo Repo URL cannot be empty! Exiting.
    pause
    exit
)
echo.
echo 1. Initializing Git Repository...
git init
echo.
echo 2. Staging all files...
git add .
echo.
echo 3. Creating commit...
git commit -m "feat: implement voice recording, whisper transcription, proctoring security, and premium UI"
echo.
echo 4. Renaming branch to main...
git branch -M main
echo.
echo 5. Linking to GitHub remote...
git remote remove origin >nul 2>&1
git remote add origin %repo_url%
echo.
echo 6. Pushing code to GitHub (You may see a browser login pop-up)...
git push -u origin main
echo.
echo ===================================================
echo Done! Code pushed to GitHub successfully.
echo ===================================================
pause
