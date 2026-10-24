@echo off
chcp 65001 >nul
echo ORDR 메모리 진단 (읽기 전용). 원랜디 게임 중에 실행하세요.
echo 스캔을 두 번 합니다. 두 스캔 사이에 유닛 하나의 개수를 바꿉니다.
echo   나미 h001  조로 h002  루피 h003  상디 h004  버기 h005
echo   칼병 h006  우솝 h007  쵸파 h008  총병 h009  후쿠로 h00A  검은수염 전설 h02U
set "CODES="
set /p CODES=지금 가진 유닛 코드(쉼표로, Enter = h008,h005,h009): 
if "%CODES%"=="" set "CODES=h008,h005,h009"
set "N1="
set /p N1=그 유닛들의 지금 개수(예: 쵸파 3, 버기 2, 총병 1): 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Codes "%CODES%" -Note "%N1%" -Out "%USERPROFILE%\Desktop\ordr_memscan_1.json"
echo.
echo 1차 스캔 끝. 이제 게임에서 위 유닛 중 하나를 1개 늘리거나 줄이세요(뽑기, 조합 재료로 쓰기, 팔기 등).
set "N2="
set /p N2=바꾼 뒤 개수(예: 쵸파 4, 버기 2, 총병 1)를 입력하고 Enter: 
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Codes "%CODES%" -Note "%N2%" -Out "%USERPROFILE%\Desktop\ordr_memscan_2.json"
echo.
echo 끝났습니다. 바탕화면의 ordr_memscan_1.json, ordr_memscan_2.json 두 파일을 보내주세요.
pause
