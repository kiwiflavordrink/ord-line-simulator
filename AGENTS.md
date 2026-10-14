# 원랜디 시뮬레이터 — 에이전트 공통 작업 지침

Claude Code(클라우드·로컬)와 Codex Cloud가 함께 쓰는 지침이다. `CLAUDE.md`는 이 파일을 불러온다.

## 구조

- `dist/` — GitHub Pages로 배포되는 정적 사이트이자 **계산의 단일 기준**.
  - `engine_v3.mjs`(`simulateV2`, 60~65라 조합), `engine_single_v3.mjs`(`simulateSingle`, 65라 단일), `v3_effects.mjs`(`damageContext`), `data.json`(영웅·몹 수치).
  - `v2.*`, `index.html`/`app.mjs`, `engine.mjs`, `engine_v2.mjs`는 기존 URL과 테스트를 위해 유지한다.
- `cli/` — 엔진을 그대로 호출하는 Node.js CLI(`ordsim`). 형식은 `docs/CLI.md`.
- `examples/` — CLI 시나리오 예시. `test_cli.mjs`가 사용한다.
- `docs/` — 조사 근거(`피해증폭_조사.md`)와 CLI 문서.
- 원본 맵(`.w3x`)과 2.305 추출 자료는 저장소가 아니라 GitHub Release `map-data-2.305-2.323` 첨부파일에 있다.

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
