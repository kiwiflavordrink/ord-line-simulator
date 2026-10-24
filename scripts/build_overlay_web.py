"""Builds the no-install overlay package (수정내역 47): ordr_overlay.bat + PowerShell scripts + the overlay page and
the engine files it imports. Usage: python scripts/build_overlay_web.py out.zip"""
import sys,zipfile,glob,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files=['ordr_overlay.bat','ordr_overlay_web.bat','tools/overlay-native/native.ps1','tools/overlay-web/serve.ps1','tools/overlay-web/topmost.ps1','tools/memscan/memscan.ps1','tools/memscan/hand.bat','tools/memscan/probe.bat','dist/data.json']
files+=[os.path.relpath(p,root) for p in glob.glob(os.path.join(root,'dist','*.mjs'))]
files+=[os.path.relpath(p,root) for p in glob.glob(os.path.join(root,'overlay','renderer','*'))]
readme=('ORDR 오버레이 (설치 없음)\r\n\r\n'
 '1. 이 압축을 아무 폴더에 푼다.\r\n2. 원랜디 게임을 켠다.\r\n'
 '3. ordr_overlay.bat 를 더블클릭한다. 최소화된 PowerShell 창들과 오버레이 창이 뜬다(계산하는 엣지는 화면에 안 보인다).\r\n'
 '   오버레이 창은 클릭해도 게임 포커스를 뺏지 않는다(수정내역 68). 위쪽 머리줄을 끌어 옮긴다.\r\n'
 '4. 1~3분 뒤 보유 유닛이 채워지고 3초마다 갱신된다. 헬퍼 Data 폴더는 자동으로 찾는다(못 찾으면 ordr_overlay.bat 0 "헬퍼Data경로").\r\n'
 '단축키: F1 숨기기/보이기, F2 다음 탭 (바꾸려면 ordr_overlay.bat 0 "" F8 F9). 가−/가+ 글씨, ▤ 접기, ▲▼ 스크롤, ✕ 끄기.\r\n'
 '탭: 지금 조합 / 목표 후보(☑ 종류를 눌러 켜고 끄기, 유닛을 누르면 목표) / 추천 상위 / 부족한 것(난이도 바꾸기) / 보유 유닛.\r\n'
 '끄기: 오버레이 창 ✕, 그리고 최소화된 PowerShell 창들을 닫는다.\r\n멀티에서 2번 자리면: ordr_overlay.bat 1 (3번이면 2).\r\n'
 '예전 엣지 창 방식: ordr_overlay_web.bat\r\n\r\n'
 '게임 메모리는 읽기 전용으로만 연다. 다른 프로그램이 게임 메모리를 읽는 것은 블리자드 약관상 회색지대다.\r\n')
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(set(files)): z.write(os.path.join(root,f),'ordr-overlay/'+f.replace(os.sep,'/'))
  z.writestr('ordr-overlay/README.txt','﻿'+readme)
print(len(files),'files')
