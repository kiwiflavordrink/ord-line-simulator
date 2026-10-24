@echo off
chcp 65001 >nul
echo ORDR 보유 패 읽기 (읽기 전용). 원랜디 게임 중에 실행하세요. 1~3분 걸립니다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Hand -Out "%USERPROFILE%\Desktop\ordr_hand.json"
echo.
echo 위 목록이 실제 가진 패와 맞는지 확인하고, 바탕화면의 ordr_hand.json 과 함께 알려주세요.
pause
