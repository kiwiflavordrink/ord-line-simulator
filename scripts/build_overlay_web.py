"""Builds the no-install overlay package (수정내역 47): ordr_overlay.bat + PowerShell scripts + the overlay page and
the engine files it imports. Usage: python scripts/build_overlay_web.py out.zip"""
import sys,zipfile,glob,os
root=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files=['ordr_overlay.bat','tools/overlay-web/serve.ps1','tools/memscan/memscan.ps1','tools/memscan/hand.bat','dist/data.json']
files+=[os.path.relpath(p,root) for p in glob.glob(os.path.join(root,'dist','*.mjs'))]
files+=[os.path.relpath(p,root) for p in glob.glob(os.path.join(root,'overlay','renderer','*'))]
readme=('ORDR 오버레이 (설치 없음)\r\n\r\n'
 '1. 이 압축을 아무 폴더에 푼다.\r\n2. 원랜디 게임을 켠다(창 모드 또는 전체 창 모드).\r\n'
 '3. ordr_overlay.bat 를 더블클릭한다. 작은 PowerShell 창 2개(최소화)와 엣지 창이 뜬다.\r\n'
 '4. 1~3분 뒤 보유 유닛이 채워지고 3초마다 갱신된다. 난이도와 헬퍼 Data 폴더는 엣지 창의 설정(톱니)에서 고른다.\r\n'
 '끄기: 엣지 창과 최소화된 PowerShell 창 2개를 닫는다.\r\n멀티에서 2번 자리면: 명령 프롬프트에서 ordr_overlay.bat 1 (3번이면 2).\r\n\r\n'
 '게임 메모리는 읽기 전용으로만 연다. 다른 프로그램이 게임 메모리를 읽는 것은 블리자드 약관상 회색지대다.\r\n')
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED) as z:
  for f in sorted(set(files)): z.write(os.path.join(root,f),'ordr-overlay/'+f.replace(os.sep,'/'))
  z.writestr('ordr-overlay/README.txt','﻿'+readme)
print(len(files),'files')
