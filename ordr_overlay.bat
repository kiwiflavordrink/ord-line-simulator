@echo off
chcp 65001 >nul
rem ORDR overlay (native window, change log 68): clicking it does not take focus from Warcraft III.
rem hand reader + local server + hidden Edge (calculation) + native window
rem usage: ordr_overlay.bat [player slot 0-3] [helper Data folder] [hide key, default F1] [tab key, default F2]
rem the older Edge-window overlay: ordr_overlay_web.bat
set "PLAYER=%~1"
if "%PLAYER%"=="" set "PLAYER=0"
set "HOTKEY=%~3"
if "%HOTKEY%"=="" set "HOTKEY=F1"
set "TABKEY=%~4"
if "%TABKEY%"=="" set "TABKEY=F2"
del "%TEMP%\ordr_overlay_view.json" 2>nul
start "ORDR hand" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\memscan\memscan.ps1" -Watch -Player %PLAYER% -Out "%TEMP%\ordr_hand_live.json"
start "ORDR server" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\overlay-web\serve.ps1" -Root "%~dp0." -HelperData "%~2"
timeout /t 3 /nobreak >nul
start "" msedge --headless=new --disable-gpu --disable-background-timer-throttling --disable-renderer-backgrounding --user-data-dir="%LOCALAPPDATA%\ordr-overlay-edge" "http://localhost:8765/overlay/renderer/index.html?src=memory&native=1"
start "ORDR overlay" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\overlay-native\native.ps1" -HideKey %HOTKEY% -TabKey %TABKEY%
