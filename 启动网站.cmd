@echo off
powershell.exe -NoProfile -File "%~dp0Start-Website.ps1" -Open
if errorlevel 1 pause
