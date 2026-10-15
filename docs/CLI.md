# ordsim CLI — 원랜디 시뮬레이터 명령줄 실행

`cli/ordsim.mjs`는 웹 v3와 **같은 계산 엔진**을 Node.js에서 그대로 호출해 JSON 결과를 내는 도구다.

| 계산 | 호출하는 엔진 (수정하지 않음) |
|---|---|
| 60~65라 조합 | `dist/engine_v3.mjs`의 `simulateV2` |
| 65라 단일 테스터 | `dist/engine_single_v3.mjs`의 `simulateSingle`, `referenceSingle` |
| 증폭·마방 상황 | `dist/v3_effects.mjs`의 `damageContext` |

CLI는 입력 검증과 결과 형식 변환만 한다. 계산식은 복사하지 않았으므로 엔진을 고치면 웹과 CLI가 함께 바뀐다. 상황 설정(`context`)을 엔진 옵션으로 바꾸는 방식은 `dist/v3.mjs`의 `options()`와 같다.

## 요구 사항과 실행

Node.js 18 이상. 설치할 의존성은 없다.

```bash
node cli/ordsim.mjs examples/line_basic.json          # 파일 입력
cat examples/combined.json | node cli/ordsim.mjs      # 표준입력
node cli/ordsim.mjs - < examples/single_lucci_hancock.json
node cli/ordsim.mjs examples/line_basic.json --compact --timeline
node cli/ordsim.mjs --list-units                      # 지원 코드 목록
npm run sim -- examples/line_basic.json               # npm 스크립트
```

| 옵션 | 뜻 |
|---|---|
| `--compact` | 한 줄 JSON 출력 (기본은 들여쓰기) |
| `--timeline` | 1초 단위 생존 몹 수(엔진 `timeline`)를 결과에 포함 |
| `--list-units` | 라인 영웅·보조·삭제, 단일 테스터 유닛, 증폭 효과 코드 목록 |
| `--help` | 사용법 |

### 종료 코드

| 코드 | 의미 | 출력 |
|---|---|---|
| 0 | 성공 | 표준출력에 `{"ok": true, ...}` |
| 1 | 엔진 실행 오류 (예: 단일 테스터 12000회 공격 안에 처치 실패) | 표준출력에 `{"ok": false, "errorType": "engine", ...}` |
| 2 | 입력·사용법 오류 | 표준출력에 `{"ok": false, "errorType": "input" 또는 "usage", "errors": [...]}`, 표준오류에 사람이 읽는 이유 |

`errors[]`의 각 항목은 `path`(예: `line.team[0].code`), `code`(예: `UNSUPPORTED_UNIT`, `OUT_OF_RANGE`, `UNKNOWN_KEY`, `INVALID_JSON`), `message`를 가진다.

## 시나리오 형식

```jsonc
{
  "name": "선택 · 결과에 그대로 표시",
  "description": "선택",
  "context": {                      // 선택 · line과 single에 같이 적용
    "selected": ["TR10", "I2"],     // 증폭·마방 감소 효과 코드 (--list-units의 effects)
    "customMagicAmp": 0,            // 직접 입력, % 단위 (0~500)
    "customMagicCut": 0,            // %p
    "customAllAmp": 0,              // %
    "customExplosiveAmp": 0,        // %
    "warcury": false                // 워큐리 신 저주 (마방 -10단계, 방어 +10)
  },
  "line": {                         // 60~65라 조합 (line과 single 중 하나 이상 필요)
    "team": [
      {"code": "TR19", "count": 1},                 // count: 정수 1~6, 기본 1
      {"code": "D3", "count": 1, "damage": true, "ab": true}
    ],
    "options": { ... }              // 선택 · 아래 표
  },
  "single": {                       // 65라 단일 테스터
    "team": [{"code": "L9", "count": 1}],         // count: 정수 1~12, 합계 12기 이하
    "trials": 3000,                 // 100~20000, 기본 3000
    "seed": 202323,                 // 0~2147483647, 기본 202323
    "reference": true               // 루치·핸콕 기준 단/끝 비율 계산, 기본 true
  },
  "output": {"timeline": false}
}
```

알 수 없는 키는 오타를 막기 위해 오류로 처리한다.

### line.team 코드

- `dist/data.json`의 영웅 31명 (`--list-units`의 `line.heroes`)
- 보조 `L7` `L23` `L25` `D3` — `ab: false`면 암브(방깎) 효과 제외, `damage: false`면 피해 제외
- 조건형 `I8`(스코퍼가반 불멸) `TR28`(프랑키 초월) `H15`(써니호 히든)
- 삭제 `L12` `D4` `L19`
- `MAGIC_CUSTOM` — `options.customMagic`으로 정의하는 가상 범위 마법 유닛

**목록에 없는 코드는 `UNSUPPORTED_UNIT`(미지원) 오류로 실패한다.** 게임에 있는 영웅이라도 data.json에 없으면 수치를 추정하지 않는다. 단일 테스터 전용 코드(예: `L9`)나 효과 코드(예: `L1`)를 넣으면 메시지에 어디서 쓸 수 있는지 안내한다.

### line.options

생략한 항목은 **엔진 기본값**을 쓴다. 비율은 모두 0~1 소수다(웹 화면의 %가 아님).

| 키 | 범위 | 엔진 기본 | 뜻 |
|---|---|---|---|
| `cut` | 0~300 | 201 | 고정 방깎 (암브 별도) |
| `coverage` | 0~1 | 1 | 범위 적중률 |
| `red` | bool | true | 레드포스호 공증 35% |
| `redDamage` | bool | `red`와 같음 | 레드포스호 직접 피해 (웹은 `red`와 함께 켜고 끔) |
| `fullResource` | bool | true | 시작 자원 만충 |
| `summons` | bool | true | 소환 범위 피해 포함 |
| `frankyAura` | bool | true | 프랑키가 써니호 700범위 안에 있어 써니호 마나 +5/초 |
| `sunnyStagger` | bool | false | 써니호 여러 기의 스킬 시점을 균등 분산 |
| `customMagic.aps` / `.chance` | 0~100 / 0~1 | 5 / 0.15 | `MAGIC_CUSTOM`의 초당 공격·발동 확률 |
| `customMagic.flat` | 0~1e10 | 0 | 1회·몹당 마법 피해 (웹 기본은 1,000,000) |
| `customMagic.maxPct` / `.currentPct` / `.lostPct` | 0~1 | 0 | HP 비례 피해 |
| `finisher.mode` | `off` · `damage` | `off` | 단일 마무리 |
| `finisher.interval` | 0.5~60 | 5 | 마무리 간격 (초) |
| `finisher.successChance` | 0~1 | 1 | 사용 성공률 |
| `finisher.damageType` | `magic` `physical` `fixed` `explosive` | `magic` | 마무리 피해 유형 |
| `finisher.flat` / `.maxPct` / `.currentPct` / `.lostPct` | 0~1e10 / 0~1 | 0 | 마무리 피해 |
| `deletion.seed` | 정수 | 202323 | 삭제 확률 시드 |
| `deletion.L12Cooldown` `D4Cooldown` `L19Cooldown` | 0.1~300 | 8.5 / 7.5 / 85 | 절대쿨 |
| `deletion.L12Proc` `D4Proc` `L19Proc` | 0~1 | 1 / 0.1 / 1 | 삭제 확률 |

마법 증폭·마방 감소·폭발형·모든 피해 증폭은 `line.options`가 아니라 `context`로 넣는다. 결과의 `input.line.engineOptions`에 엔진에 실제로 넘긴 옵션이 나온다.

## 결과 형식

| 위치 | 내용 |
|---|---|
| `data.version`, `data.sha256` | data.json의 버전 문자열과 파일 해시 |
| `engines` | 호출한 엔진 함수 |
| `input` | 검증·정규화된 입력, `line.engineOptions` |
| `damageContext` | 마방 단계, 마법·폭발형·모든 피해 배율 |
| `line.clear`, `verdict`, `failedRound`, `failedSecond` | 클리어 판정. 동시 생존 55기에 닿으면 실패하고 그 시점에서 계산을 멈춘다 |
| `line.rounds[]` | 라운드별 `remaining`(보스·광폭 포함 잔존 수), `lineRemaining`, 이전 라운드 이월 수, 평균 암브, `special` 처리 결과 |
| `line.rounds[].special` | 60·65라 `boss`, 61~64라 `frenzy`. `result`: `killed` / `survived`(라운드 끝에 생존, 다음 라운드로 이월) / `unknown_round_failed` / `not_reached`. `killSecond`는 해당 라운드 시작 기준 초(광폭은 7.5초에 등장) |
| `line.damage` | 라인 일반몹에 들어간 피해. `byCategory`(area·basic·finisher·magic·physical·fixed), `bySource`(유닛 코드별, `H2`는 레드포스호) |
| `line.control` | 써니호 스킬 발동·스턴 시간 집계 (판정에는 미사용) |
| `line.totals`, `finisher`, `deletions`, `applied` | 생성·처치 수, 마무리 시도·처치, 삭제 횟수, 적용된 방깎·범위 적중·마법 배율 |
| `single` | `to15Seconds`(100→15%), `killSeconds`, `finishFrom15Seconds`(15%→처치), `remainingAt3`, `damageBy3Seconds`, `reference.danRatio`(루치 기준 단), `reference.endRatio`(핸콕 기준 끝) |
| `warnings` | 계산은 했지만 확인할 점 (상한 도달, 무시된 설정 등) |
| `limitations` | 현재 모델의 계산상 한계. 항상 포함 |

`line.damage.byCategory`의 `area`+`basic`+`finisher`가 합계이고, `magic`·`physical`·`fixed`는 그중 유형을 알 수 있는 부분만 따로 센 값이다(영웅 스킬은 `mixed`라 유형별 칸에 들어가지 않는다).

## 예시 시나리오

| 파일 | 내용 |
|---|---|
| `examples/line_basic.json` | 우솝 초월 + 퀸 왜곡, 웹 기본 조건 |
| `examples/line_low_cut_fail.json` | 사보 초월 단독, 방깎 80·범위 적중 70% → 패배 |
| `examples/line_amp_finisher.json` | 워큐리·마법 증폭·폭발형 증폭, 모리아 삭제, 5초 마무리 |
| `examples/single_lucci_hancock.json` | 루치 + 핸콕 단일 테스터 |
| `examples/combined.json` | 같은 context로 라인과 단일 동시 계산 |
| `examples/line_conditional.json` | 조건형 프랑키·써니호·가반, 프랑키 오라·써니호 시점 분산 |
| `examples/invalid_unsupported.json` | 미지원 영웅·범위 초과 → 종료 코드 2 |

### 실제 출력 (발췌)

`node cli/ordsim.mjs examples/line_basic.json`

```json
"line": {
  "clear": true,
  "verdict": "65라 종료까지 55기 미만 유지",
  "final": {"remaining": 22, "lineRemaining": 22, "averageAb": 17.39884431818177},
  "rounds": [
    {"round": 60, "remaining": 10, "special": {"type": "boss", "result": "killed", "killSecond": 28.2}},
    {"round": 61, "remaining": 2,  "special": {"type": "frenzy", "result": "killed", "killSecond": 9}},
    {"round": 62, "remaining": 9,  "special": {"type": "frenzy", "result": "killed", "killSecond": 9}},
    {"round": 63, "remaining": 9,  "special": {"type": "frenzy", "result": "killed", "killSecond": 9}},
    {"round": 64, "remaining": 16, "special": {"type": "frenzy", "result": "killed", "killSecond": 9}},
    {"round": 65, "remaining": 22, "special": {"type": "boss", "result": "killed", "killSecond": 30.9}}
  ],
  "damage": {
    "lineTotal": 28149775117.9802,
    "bySource": {"D3": 3107918871.8533893, "TR19": 24057210018.264957, "H2": 984646227.8618543}
  },
  "totals": {"lineSpawned": 210, "lineKilled": 188, "unitCount": 2}
}
```

`node cli/ordsim.mjs examples/line_low_cut_fail.json` — 61라 8.5초에 패배

```json
{"round": 60, "completed": true,  "remaining": 36, "special": {"type": "boss", "result": "survived"}},
{"round": 61, "completed": false, "remaining": 55, "failedSecond": 8.5, "special": {"type": "frenzy", "result": "unknown_round_failed"}},
{"round": 62, "reached": false, "special": {"type": "frenzy", "result": "not_reached"}}
```

`node cli/ordsim.mjs examples/single_lucci_hancock.json`

```json
"single": {
  "count": 2, "trials": 3000, "seed": 202323,
  "to15Seconds": 3.691312176213074,
  "killSeconds": 5.279905078237144,
  "finishFrom15Seconds": 1.9925995197324167,
  "remainingAt3": 39962395.491772056,
  "reference": {"danRatio": 1.4994679615409205, "endRatio": 1.417246549955263}
}
```

`node cli/ordsim.mjs examples/invalid_unsupported.json` → 종료 코드 2

```json
{
  "ok": false,
  "errorType": "input",
  "errors": [
    {"path": "line.team[0].code", "code": "UNSUPPORTED_UNIT", "message": "미지원: 'L1'는 현재 data.json(2.305 원시 공격 + 2.323 ORDR 툴팁)과 라인 엔진에 등록되지 않은 유닛입니다. 임의 수치를 만들지 않습니다. 증폭·마방 감소 효과로는 context.selected에 넣을 수 있습니다."},
    {"path": "line.team[1].code", "code": "UNSUPPORTED_UNIT", "message": "미지원: 'L9'는 ... 이 코드는 single.team(65라 단일 테스터)에서만 지원됩니다."},
    {"path": "line.team[2].count", "code": "OUT_OF_RANGE", "message": "1~6 범위여야 합니다. (입력 7)"}
  ]
}
```

## 계산상 한계 (결과의 `limitations`)

- 몹·영웅 기본 수치는 2.305 맵 추출값, 스킬은 2.323 ORDR 카드 설명 기반 근사다. 2.323 원본 스크립트 실행 검증이 아니다.
- 라인은 data.json의 상위 영웅 31명과 보조 4·삭제 3종만 지원한다. 나머지 상위 영웅은 미등록이다.
- 단일 테스터는 단일·끝딜 유닛 10종만 지원한다.
- 스턴·슬로우 등 제어, 몹 이동·위치·사거리는 구현되지 않았다. 범위 피해는 `coverage`로 근사한다.
- 선택한 증폭 효과는 항상 걸려 있다고 가정한다. 발동 확률·지속시간·대상 조건은 판정하지 않는다.
- 서로 다른 저항·증폭 단계의 결합 순서는 곱셈으로 가정한다.
- 보스·광폭에 들어간 피해량은 엔진이 집계하지 않는다(처치 여부·시각만 보고).
- `clear`는 모델상 55기 미만 유지이며 실제 클리어 보장이 아니다.

## 테스트

```bash
npm test            # test_single, test_support, test_v2, test_cli
node test_cli.mjs   # CLI 결과 = 엔진 직접 호출 결과 확인
```

`test_cli.mjs`는 예시 시나리오마다 엔진을 직접 호출한 결과와 CLI 결과(라운드별 잔존 수, 특수몹 처치 시각, 피해량, 삭제·마무리 횟수, 단일 테스터 시간)가 정확히 같은지 확인하고, 잘못된 입력이 종료 코드 2로 실패하는지 확인한다. `test_engine.mjs`는 저장소 밖 `../work/physical_cut_screen.json`이 있어야 해서 `npm test`에 넣지 않았다(`npm run test:legacy-engine`).
