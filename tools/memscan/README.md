# ORDR 메모리 진단 (읽기 전용)

오버레이가 게임 중 보유 패를 자동으로 읽게 하려고, 워크3 메모리에서 유닛 정보가 어디에 어떤 모양으로 있는지 찾는 첫 단계다(수정내역 42).

- 게임 프로세스를 **읽기 권한만으로** 연다(`PROCESS_QUERY_INFORMATION | PROCESS_VM_READ`). 게임 메모리에 쓰거나 주입하지 않는다.
- 주의: 읽기 전용이라도 다른 프로그램이 게임 메모리를 읽는 것은 블리자드 약관상 회색지대다. 사용 여부는 사용자가 판단한다.

## 실행

1. 이 폴더의 `memscan.bat`과 `memscan.ps1`을 **같은 폴더**에 받는다.
2. 원랜디 게임 중(유닛을 가진 상태)에 `memscan.bat`을 더블클릭한다. 지금 가진 유닛 코드를 쉼표로 입력한다(Enter만 누르면 칼병·나미·쵸파). 코드는 창에 나오고, 나머지는 `dist/data.json`의 `forms[].rawcode`에 있다.
3. 1~3분 뒤 바탕화면에 `ordr_memscan.json`이 생긴다. 이 파일과 **그때 가진 유닛과 개수**를 함께 보낸다. `OpenProcess failed`가 나오면 bat을 우클릭 → 관리자 권한으로 실행.

PowerShell에서 직접: `powershell -ExecutionPolicy Bypass -File memscan.ps1 -Codes h006,h001,h008`

결과 파일에는 코드가 나온 주소와 그 앞뒤 96바이트만 들어간다. 계정·채팅 같은 정보는 찾지 않는다.
