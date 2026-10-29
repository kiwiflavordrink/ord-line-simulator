@echo off
rem ORDR quest progress finder (read-only): run during a game, follow the prompts. Player 2 slot: track.bat 1
set PLAYER=%1
if "%PLAYER%"=="" set PLAYER=0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Track -Player %PLAYER%
pause
