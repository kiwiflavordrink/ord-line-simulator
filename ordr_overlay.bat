@echo off
chcp 65001 >nul
rem ORDR 오버레이 (설치 없이): 패 읽기 + 로컬 서버 + 엣지 창
set "PLAYER=%~1"
if "%PLAYER%"=="" set "PLAYER=0"
start "ORDR 패 읽기" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\memscan\memscan.ps1" -Watch -Player %PLAYER% -Out "%TEMP%\ordr_hand_live.json"
start "ORDR 오버레이 서버" /min powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\overlay-web\serve.ps1" -Root "%~dp0."
timeout /t 3 /nobreak >nul
start "" msedge --app="http://localhost:8765/overlay/renderer/index.html?src=memory" --window-size=440,700
