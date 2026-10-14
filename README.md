# 원랜디 60–65라 조합 시뮬레이터

공개 페이지: https://ordr-s2-line-sim-2026.msf011111.chatgpt.site/v3

공개 자료실: https://ordr-s2-line-sim-2026.msf011111.chatgpt.site/resources.html

정적 HTML/JavaScript 사이트입니다. 서버나 데이터베이스가 필요하지 않습니다. 다른 컴퓨터에서 이 폴더를 내려받아 Claude Code 등으로 수정할 수 있습니다.

## 파일 안내

- `dist/v3.html`, `dist/v3.mjs`, `dist/style.css`: v3 화면과 입력 처리
- `dist/v3_effects.mjs`: 2.323 ORDR 툴팁에서 확인한 피해 증폭·마방 감소 목록과 상황별 합산
- `dist/engine_single_v3.mjs`: 65라 일반몹 한 기의 단일/끝딜 몬테카를로 계산
- `dist/engine_v3.mjs`: 60~65라 조합 전투 계산
- `dist/data.json`: 영웅 및 몹 데이터. 2.305 원본 수치와 2.323 툴팁 기반 근사가 섞여 있음
- `dist/v2.html` 등: 이전 버전. v3 변경 시 기존 URL을 깨지 않도록 유지
- `dist/resources.html`, `dist/resources/`: 엑셀 8개와 조사 노트 5개의 공개 다운로드
- `test_*.mjs`: 계산 엔진 회귀 확인. `test_cli.mjs`는 CLI 결과와 엔진 직접 호출 결과가 같은지 확인
- `cli/ordsim.mjs`, `cli/scenario.mjs`: v3 엔진을 그대로 호출하는 Node.js CLI. 사용법은 `docs/CLI.md`
- `examples/`: CLI 시나리오 예시
- `AGENTS.md`(`CLAUDE.md`가 불러옴): Claude Code와 Codex가 공통으로 따르는 작업 지침

## 로컬 실행

`dist` 폴더를 정적 웹서버로 제공한 다음 `/v3.html`을 엽니다. 예: Python이 있으면 프로젝트 폴더에서 `python -m http.server 8000 -d dist`. 브라우저에서 파일을 직접 열면 `data.json` 가져오기가 차단될 수 있습니다.

`npm test`로 엔진 회귀 테스트와 CLI 통합 테스트를 실행합니다(Node.js 18 이상, 의존성 없음). `test_engine.mjs`는 저장소 밖 `../work/` 자료가 있어야 실행됩니다. v3는 `dist/v3_effects.mjs`가 내보내는 `damageContext`로 마방·증폭 단계값을 만든 뒤 두 계산 엔진에 같은 상황을 전달합니다.

## CLI

```bash
node cli/ordsim.mjs examples/line_basic.json          # 60~65라 조합
node cli/ordsim.mjs examples/single_lucci_hancock.json # 65라 단일 테스터
cat my_scenario.json | node cli/ordsim.mjs --compact  # 표준입력
```

결과는 JSON이며 라운드별 잔존 수, 클리어 판정, 보스·광폭 처리, 피해량, 입력 조건, 데이터 버전, 계산상 한계를 담습니다. 입력 오류는 종료 코드 2로 끝납니다. 자세한 형식은 `docs/CLI.md`를 보세요.

## 계산 경계

- 2.305 맵: `A04Q` 마방 단계, `A04R` 마법 증폭, `A11S` 폭발형 증폭의 적용 방식 근거.
- 2.310 패치: 워큐리 신 방어·마방 +7에서 +10으로 변경.
- 2.314 패치: 공격력 비례 폭발형 스킬에 모든 피해 증폭이 두 번 들어가던 문제 수정. 현행 모델은 한 번 적용.
- 2.323 ORDR 카드: 현행 유닛별 숫자. 카드 본문과 변경 이력이 충돌하면 카드 본문 우선(예: 바제스 11%).
- 같은 종류의 증폭은 합산한다. **서로 다른 Warcraft III 저항 능력의 정확한 결합 순서는 실측 미완료이므로 v3에서 곱셈으로 가정한다.**
- 효과 체크는 대상에게 계속 붙어 있는 상황을 뜻한다. 발동 확률과 지속시간을 자동 산출하지 않는다.
- 라인 전투는 범위 적중률, 타깃팅, 제어 효과를 근사한다. 실제 클리어 보장이 아니다.

조사 근거는 `docs/피해증폭_조사.md`에 있다. 원본 맵(2.305·2.323 `.w3x`)과 2.305 추출 자료는 GitHub Release `map-data-2.305-2.323`의 첨부파일로 보관한다.

## 배포

현재 공개 사이트는 ChatGPT Sites에 배포되어 있습니다. 이 저장소의 `.github/workflows/static.yml`은 `main`에 푸시될 때 `dist/` 폴더를 GitHub Pages로 배포합니다. `.github/workflows/test.yml`은 PR과 `main` 푸시에서 `npm test`를 실행합니다.
