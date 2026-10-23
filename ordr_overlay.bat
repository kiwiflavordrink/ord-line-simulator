@echo off
chcp 65001 >nul
rem ORDR overlay without installing: hand reader + local server + Edge window kept on top
rem usage: ordr_overlay.bat [player slot 0-3] [helper Data folder] [hide key, default F1] [tab key, default F2] [click-mode key, default F3]
set "PLAYER=%~1"
if "%PLAYER%"=="" set "PLAYER=0"
set "HOTKEY=%~3"
if "%HOTKEY%"=="" set "HOTKEY=F1"
set "TABKEY=%~4"
if "%TABKEY%"=="" set "TABKEY=F2"
set "CLICKKEY=%~5"
if "%CLICKKEY%"=="" set "CLICKKEY=F3"
start "ORDR hand" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\memscan\memscan.ps1" -Watch -Player %PLAYER% -Out "%TEMP%\ordr_hand_live.json"
start "ORDR server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\overlay-web\serve.ps1" -Root "%~dp0." -HelperData "%~2"
start "ORDR top" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\overlay-web\topmost.ps1" -Hotkey %HOTKEY% -TabKey %TABKEY% -ClickKey %CLICKKEY%
timeout /t 3 /nobreak >nul
start "" msedge --app="http://localhost:8765/overlay/renderer/index.html?src=memory" --window-size=440,760
