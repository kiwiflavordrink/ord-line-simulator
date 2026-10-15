# 원랜디 시뮬레이터 — 에이전트 공통 작업 지침

Claude Code(클라우드·로컬)와 Codex Cloud가 함께 쓰는 지침이다. `CLAUDE.md`는 이 파일을 불러온다.

## 구조

- `dist/` — GitHub Pages로 배포되는 정적 사이트이자 **계산의 단일 기준**.
  - `engine_v3.mjs`(`simulateV2`, 60~65라 조합), `engine_single_v3.mjs`(`simulateSingle`, 65라 단일), `v3_effects.mjs`(`damageContext`), `data.json`(영웅·몹 수치).
  - `v2.*`, `index.html`/`app.mjs`, `engine.mjs`, `engine_v2.mjs`는 기존 URL과 테스트를 위해 유지한다.
- `cli/` — 엔진을 그대로 호출하는 Node.js CLI(`ordsim`). 형식은 `docs/CLI.md`.
- `dist/data_legacy.json` — v1·v2 화면과 그 테스트가 쓰는 수정 전 데이터(main `aa6ff9d`와 동일). v3 계산 수정은 `dist/data.json`에만 한다.
- `scripts/hero_results.mjs`, `scripts/diff_results.mjs` — 수정 전후 결과 스냅샷(`docs/results/`)과 차이 표. `scripts/format_data_json.py` — data.json을 이벤트 한 줄씩으로 정렬(값 불변).
- `examples/` — CLI 시나리오 예시. `test_cli.mjs`가 사용한다.
- `docs/` — 조사 근거(`피해증폭_조사.md`), ORDR 툴팁 검증 계획, 계산 수정 내역(`수정내역.md`), CLI 문서.
- `dist/ordr_units.json` — ORDR.kr 2.323 툴팁 스냅샷(271종). 갱신·검증은 `scripts/sync_ordr_tooltips.py`, `scripts/validate_ordr_tooltips.py`.
- 원본 맵과 2.305 추출 자료(`war3map.j`·`.wts`·`.w3u`·`.w3a`)는 `dist/resources/maps/`와 GitHub Release `map-data-2.305-2.323`에 있다. 수정하지 않는다.

## 수치·구조 근거 원칙

- 복호화된 맵은 2.305뿐이다. 2.323 유닛 수치는 ORDR.kr 툴팁(`dist/ordr_units.json`)으로만 알 수 있다.
- **구조는 2.305 맵, 수치는 2.323 툴팁**으로 정한다. 구조란 스킬의 발동 방식·대상·범위/단일·피해 타입·공격/방어 타입·자원 규칙·변신 방식이고, 수치란 계수·고정 피해·확률·쿨타임·체력 비율이다. 2.305와 2.323은 수치만 다르다고 가정한다.
- 툴팁에 수치가 없고 2.305에만 있으면 2.305 값을 쓰되 `[2.305 기준]`으로 표시한다. 둘 다 없으면 추정이라고 표시하고 결과의 한계에 남긴다.
- 계산을 바꾸면 `node scripts/hero_results.mjs docs/results/<단계>.json`과 `scripts/diff_results.mjs`로 전후 결과를 남기고, `docs/수정내역.md`에 무엇을, 어떤 근거(툴팁 문장 / 2.305 맵 파일:줄 / 패치 문서)로, 결과가 어떻게 바뀌었는지 기록한다. data.json 이벤트를 바꾸면 그 이벤트의 `source`·`note`에도 근거를 적는다.

## 규칙

1. 계산식은 `dist/`의 엔진에만 둔다. CLI·테스트·스크립트에 계산식을 복사하지 말고 엔진 함수를 import해서 호출한다.
2. data.json에 없는 영웅의 수치를 추정해서 넣지 않는다. 미지원으로 표시한다.
3. `dist/`의 파일 이름·export·URL과 `.github/workflows/static.yml`을 깨지 않는다. Pages는 `dist/`만 배포한다.
4. Release의 원본 맵 파일은 수정·재업로드하지 않는다. 내려받은 맵·압축 파일은 저장소에 커밋하지 않는다.
5. 엔진을 바꾸면 웹(v3)과 CLI 결과가 함께 바뀐다. 의도한 변화인지 `test_*.mjs`와 예시 결과로 확인하고, 모델 가정이 바뀌면 `docs/`와 `cli/scenario.mjs`의 `LIMITATIONS`를 갱신한다.

## 실행·검증

```bash
npm test                                      # 엔진 회귀 테스트 + CLI 통합 테스트 (Node 18+, 의존성 없음)
node cli/ordsim.mjs examples/line_basic.json  # CLI 실행
python3 -m http.server 8000 -d dist           # 웹: http://localhost:8000/v3.html
```

`test_engine.mjs`, `screen_support_proxies.mjs`, `build_data.py`는 저장소 밖 `../work/` 자료가 필요해 클라우드 환경에서는 실행되지 않는다.
