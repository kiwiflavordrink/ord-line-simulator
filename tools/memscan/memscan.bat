@echo off
chcp 65001 >nul
echo ORDR 메모리 진단 (읽기 전용). 원랜디 게임 중에 실행하세요.
echo 지금 가진 유닛 코드를 쉼표로 입력하세요. 그냥 Enter = h006,h001,h008
echo   나미 h001  조로 h002  루피 h003  상디 h004  버기 h005
echo   칼병 h006  우솝 h007  쵸파 h008  총병 h009  후쿠로 h00A  검은수염 전설 h02U
set "CODES="
set /p CODES=코드: 
if "%CODES%"=="" set "CODES=h006,h001,h008"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0memscan.ps1" -Codes "%CODES%"
echo.
echo 끝났습니다. 이 창의 내용과 바탕화면의 ordr_memscan.json 을 보내주세요.
pause
