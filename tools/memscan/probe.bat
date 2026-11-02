@echo off
rem ORDR coach probe (read-only): finds round, quests, gorosei and other players in game memory.
rem Run during a game. Player 2 slot: probe.bat 1
set PLAYER=%1
if "%PLAYER%"=="" set PLAYER=0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Probe -Player %PLAYER% -Note "probe"
pause
