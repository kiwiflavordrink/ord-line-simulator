# 원랜디 시뮬레이터 오버레이

게임 화면 위에 뜨는 작은 창입니다. 보유 유닛으로 다음을 보여 줍니다.

- 목표 유닛까지 필요한 흔함 선택 위습 수, 부족 재료, 나무·골드
- 현재 조합의 신·악몽·지옥 시뮬 결과(65라 남은 몹), 방깎·이감·스턴 지수
- 상위 유닛이 겹치는 실제 클리어의 남은 몹 분포(ORD_JHelper `tmo-clear-samples.json`)
- 가까운 다음 목표 후보와 그 유닛을 넣었을 때의 시뮬 결과

계산은 저장소의 `dist/advisor.mjs` → `dist/planner.mjs`, `dist/engine_v3.mjs`를 그대로 씁니다(웹 v3와 같은 엔진).

## 설치 없이 쓰기 (권장)

Node.js 설치 없이 윈도우 기본 PowerShell과 엣지만 쓴다(수정내역 47).

1. `python scripts/build_overlay_web.py ordr-overlay.zip`으로 만든 압축(약 0.3MB)을 받아 아무 폴더에 푼다.
2. 게임을 켜고 `ordr_overlay.bat`을 더블클릭한다. 최소화된 PowerShell 창 2개(패 읽기 `tools/memscan/memscan.ps1 -Watch`, 로컬 서버 `tools/overlay-web/serve.ps1`)와 엣지 앱 창이 뜬다.
3. 서버는 `http://localhost:8765/`에서만 이 폴더의 파일과 `/hand`(패 읽기 결과)를 내준다. 화면과 계산 코드는 아래 앱과 같다.
4. 멀티에서 2번 자리면 `ordr_overlay.bat 1`. 끄려면 엣지 창과 PowerShell 창 2개를 닫는다.

엣지 창은 항상 위 고정이 안 된다. 게임 옆이나 보조 모니터에 둔다.

## 실행 (Windows)

Node.js 18 이상이 필요합니다. 저장소를 내려받은 뒤:

```bat
cd overlay
npm install
npm start
```

처음 실행하면 설정이 열립니다.

1. **헬퍼 Data 폴더**: ORD_JHelper의 `Data` 폴더(`map-recipes-2321.json`, `tmo-unit-catalog.json`, `tmo-clear-samples.json`이 있는 곳). 헬퍼 자료는 저장소에 들어 있지 않고 PC에서 직접 읽습니다.
2. **입력**
   - 게임에서 자동 읽기: 게임 메모리에서 내 유닛을 읽습니다(`tools/memscan/memscan.ps1 -Watch`, 읽기 전용). 처음 한 번은 전체를 훑느라 1~3분 걸리고, 그 뒤로는 유닛 기록이 있는 구역만 3초마다 다시 읽습니다(90초마다 전체 다시). 멀티에서는 "플레이어 자리"를 내 슬롯으로 고릅니다. 워크3 3.0.1.24371에서 확인했고, 게임 클라이언트가 업데이트되면 구조가 바뀔 수 있습니다. 다른 프로그램이 게임 메모리를 읽는 것은 블리자드 약관상 회색지대입니다.
   - 직접 입력: 아래 "보유 유닛"에서 이름으로 추가하고 ＋/−로 수를 바꿉니다.
   - 헬퍼 기록 파일 감시: 헬퍼가 쓰는 기록 파일(예: `recommendation-samples.jsonl`)을 고르면 바뀔 때마다 다시 계산합니다. 파일 형식이 확인되지 않아 유닛 목록 `[{Rawcode, Count, Owner}]`을 찾는 방식으로 읽습니다. 읽지 못하면 그 파일의 몇 줄을 보내 주세요.
   - 시나리오 재생: 헬퍼 `Simulation/default-scenario.json`의 장면을 ◀ ▶로 넘깁니다.
3. **난이도**: 자동이면 기록의 난이도, 없으면 신.

## 단축키

| 키 | 동작 |
|---|---|
| Ctrl+Shift+O | 마우스 통과 켜기/끄기 (켜면 클릭이 게임으로 갑니다) |
| Ctrl+Shift+H | 창 숨기기/보이기 |
| Ctrl+Shift+M | 접기(목표·현재 조합만) / 펼치기 |

창 위쪽 막대를 끌어 옮기고, 모서리로 크기를 바꿉니다. 위치는 저장됩니다.

## 알아 둘 점

- Warcraft III를 **창 모드** 또는 **전체 창 모드**로 실행해야 오버레이가 위에 보입니다.
- 시뮬은 실제 신 클리어보다 평균 8마리 정도 비관적입니다(헬퍼의 실제 클리어 4만 판과 비교한 결과).
- 실제 클리어 비교는 최종 덱 기준이라, 진행 중인 패와 비교하면 실제 쪽이 좋게 나옵니다.
- 레시피의 특수 조건(RDUN, IFCT, KING 등)은 의미를 확인하지 못해 이름만 표시합니다.
- 브라우저 확인: 저장소 루트에서 `python3 -m http.server 8000` 후 `http://localhost:8000/overlay/renderer/index.html` (폴더 선택은 브라우저 대화상자, 기록 파일 감시는 안 됨).
