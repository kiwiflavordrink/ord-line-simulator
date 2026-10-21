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
    "reference": true,              // 루치·핸콕 기준 단/끝 비율 계산, 기본 true
    "difficulty": "신",             // 지옥·신·악몽, 기본 신: 65라 몹 HP·방어·마방 (수정내역 20)
    "gorosei": "없음"               // 오로성. 생략하면 context.warcury가 true일 때 워큐리
  },
  "output": {"timeline": false}
}
```

알 수 없는 키는 오타를 막기 위해 오류로 처리한다.

### line.team 코드

- `dist/data.json`의 영웅 263종 (`--list-units`의 `line.heroes`): ORDR 카탈로그의 흔함~신비 전 등급(수정내역 29)과 특수 기물 `OB1` 도움소·`OB2` 군함·`OB3` 해적선·`XR1` 레일리 희귀. 근거는 `docs/유닛_근거/`
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
| `resourceMode` | `start` · `empty` · `perRound` | `fullResource`에 따라 `start`/`empty` | `start`: 60라 시작 시 1회 만충 후 연속, `empty`: 빈 자원, `perRound`: 매 라운드 만충(이전 모델) |
| `summons` | bool | true | 소환 범위 피해 포함 |
| `frankyAura` | bool | true | 프랑키가 써니호 700범위 안에 있어 써니호 마나 +5/초 |
| `sunnyStagger` | bool | false | 써니호 여러 기의 스킬 시점을 균등 분산 |
| `positionModel` | bool | false | 위치 모델: 모든 유닛을 라인몹 생성 지점에 두고 이동·사거리·범위·스턴·이속 감소를 계산 (켜면 `coverage` 무시). 스턴·이속 감소는 `deletion.seed`로 정해지는 확률 발동 |
| `difficulty` | `지옥` · `신` · `악몽` | `신` | 난이도: 몹 HP·방어·마방·재생·패배 기준(70·55·50)·광폭 오라·보스 스턴 저항, 위치 모델 이속. 구조는 2.305, 공통 HP·재생은 2.323 툴팁 (수정내역 19) |
| `gorosei` | `없음` · `나스쥬로` · `워큐리` · `새턴` | `없음` | 오로성(신·악몽만, 지옥이면 무시). 2.323 수치. `context.warcury: true`는 `워큐리`와 같다 |
| `armorModel` | `map` · `data` | `map` | 몹 방어: `map`은 2.305 공식 udef + udup×레벨(보스는 자체 오라 +10 포함), `data`는 수정내역 22 이전 값(신 62라 181, 60라 보스 327). 두 방식은 그 두 값만 다르다 (수정내역 20·22) |
| `leo` | bool | false | 위치 모델: 2.320 패왕의길 레오의 이감 10% 오라(범위 800 [추정], 레오 피해는 미반영) |
| `e6AlabastaLevel` | 정수 1~10 | 10 | E6 비비 영원의 알라바스타 건 레벨(2.305 해금: 3레벨 3연사 4타, 5레벨 이동사격, 7레벨 헤드샷 강화) (수정내역 21) |
| `e6MoveShot` | bool | true | E6 이동사격(Q, 7.25초)을 쿨마다 사용하고 3연사 쿨을 초기화. 5레벨 미만이면 무시 |
| `greenBlood` | 유닛 코드 | 없음 | 그린블러드를 받을 조합의 전설·히든 유닛 1기. 공속 +30%, 3초마다 825 범위 40만 + 최대 체력 0.4% 고정 피해·1.2초 스턴 [2.305 기준]. 다른 등급이면 적용 안 됨, 결과 `greenBlood` (수정내역 36) |
| `z2Level` | 정수 1~20 | 스택 따름(20) | Z2 레베카 제한의 60라 시작 전설의 후예 레벨. 스킬 발동마다 2% [2.305 기준]로 기대 레벨이 오르고 공격력 +3,000·스킬 피해가 레벨을 따른다. 결과 `levels` (수정내역 35) |
| `tr6Nutrients` | 정수 0~80 | 0 | TR6 료쿠규 초월의 60라 시작 양분 스택(모든 TR6이 공유). 라운드 중 변신 +1, 공격당 0.005씩 늘고 변신 공격력·공속, 삼림화·전방위 흡수 피해에 반영 (수정내역 22) |
| `externalSlow` | 0~3 | 0 | 위치 모델: 모든 적에게 거는 외부 이감(예: 1.02 = 신 풀이감). 같은 이속 공식에 더한다 (수정내역 23) |
| `externalStuns` | `[{rate, radius, normal, hero}]` | 없음 | 위치 모델: 피해 없는 외부 스턴 원천. 초당 `rate`회, 공통 공격 대상 중심 `radius` 범위, 지속 `normal`초(보스·광폭 `hero`초) |
| `singleControl` | `{to15, finish}` 초 | 없음 | 단일 컨(수정내역 24): 단 흐름이 가장 많이 깎인 라인몹(15% 초과)을 `to15`초에 최대체력 85%씩, 끝 흐름이 15% 이하 중 가장 낮은 몹을 `finish`초에 15%씩 동시에 깎는다. N단 M끝 = 루치 1기 100→15% 시간/N, 핸콕 1기 15%→처치 시간/M (단일 테스터) |
| `specialTimer` | `{boss, frenzy}` 초 | 없음 | 보스·광폭 처치 타이머(수정내역 44): 나온 뒤 이 시간이 지나면 팀이 못 잡았어도 없앤다(팀 밖의 보스킬러·광폭 담당). 보스·광폭이 살아 있을 때만 붙는 효과(예: 루피 나이트메어 원혼 폭발 매 타격)가 그 시간만큼만 붙는다 |
| `heroArmorCuts` | 불리언 | false | 조합 영웅의 자기 방깎 오라(`own_armor_cut`, 2.323 buff_lines "방어력 감소 N")를 서로 다른 영웅마다 1회씩 `cut`에 더한다. 자기 오라만 보려면 `cut: 0`과 함께 (수정내역 29) |
| `executeTarget` | `attack`·`lowest` | `attack` | 체력 조건 처형(L27 조로 전설 15% 이하)의 대상. `attack`은 2.305 구조대로 공격 대상만, `lowest`는 끝딜처럼 사거리 안 체력 비율이 가장 낮은 라인몹을 직접 지정 (수정내역 30) |
| `chosenBuffTargets` | `{코드: [코드…]}` | 조합의 다른 영웅 순서 | 한 아군에게 거는 버프(로우 외과수술·발라티에·이완코브·크래커 비스킷·토키·샤크 등, `targets: one`)를 받을 유닛. 버프 유닛 자신의 코드를 넣으면 자기 시전 (수정내역 31) |
| `stackLevel` | `zero`·`half`·`max` | 데이터 값 | 모든 영웅의 사용자 스택 단계(수정내역 28). 영웅별은 `stackLevels: {"E11": "half"}` |
| `extraStackLevels` | `{코드: 단계}` | 주 스택 단계 | 두 번째 스택(TR24 코비 버프 수 2/12/22) |
| `trait` | `on`·`off` | 데이터 값 | 모든 영웅의 특강 적용 여부. 영웅별은 `traits: {"TR15": "on"}` |
| `engageRange` | 100~3000 | 650 | 위치 모델의 교전 거리. 비비 영원처럼 자기 사거리를 쓰는 유닛 외에는 모두 이 거리 안의 몹을 친다 [추정] |
| `buffTargets` | `{소스 코드: [받는 코드…]}` | 조합 전체 | 아군 오라·버프를 받을 유닛 제한. 지정하지 않은 소스는 조합 전체가 받는다 |
| `tr19Plants` | `{pea, snow, muk}` 정수, 합 3 이하 | 2 / 1 / 0 | TR19 특강 식물 배분: 완두콩·백설콩·먹깨비 |
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
| `line.clear`, `verdict`, `failedRound`, `failedSecond` | 클리어 판정. 동시 생존이 난이도별 패배 기준(`defeatThreshold`: 지옥 70·신 55·악몽 50)에 닿으면 실패하고 그 시점에서 계산을 멈춘다 |
| `line.rounds[]` | 라운드별 `remaining`(보스·광폭 포함 잔존 수), `lineRemaining`, 이전 라운드 이월 수, 평균 암브, `special` 처리 결과 |
| `line.rounds[].special` | 60·65라 `boss`, 61~64라 `frenzy`. `result`: `killed` / `survived`(라운드 끝에 생존, 다음 라운드로 이월) / `unknown_round_failed` / `not_reached`. `killSecond`는 해당 라운드 시작 기준 초(광폭은 7.5초에 등장) |
| `line.damage` | 라인 일반몹에 들어간 피해. `byCategory`(area·basic·finisher·magic·physical·fixed), `bySource`(유닛 코드별, `H2`는 레드포스호) |
| `line.control` | 써니호 스킬 발동·스턴 시간 집계 (판정에는 미사용) |
| `line.executions` | 영웅별 라인몹 제거 수 (I3 순속·패기발산) |
| `line.totals`, `finisher`, `deletions`, `applied` | 생성·처치 수, 마무리 시도·처치, 삭제 횟수, 적용된 방깎·범위 적중·마법 배율·자원 방식·위치 모델·난이도·오로성 |
| `single` | `to15Seconds`(100→15%), `killSeconds`, `finishFrom15Seconds`(15%→처치), `remainingAt3`, `damageBy3Seconds`, `reference.danRatio`(루치 기준 단), `reference.endRatio`(핸콕 기준 끝) |
| `warnings` | 계산은 했지만 확인할 점 (상한 도달, 무시된 설정 등) |
| `limitations` | 현재 모델의 계산상 한계. 항상 포함 |

`line.damage.byCategory`의 `area`+`basic`+`single`+`finisher`가 합계이고(`single`은 공격 대상에게만 들어간 단일 추가 피해), `magic`·`physical`·`fixed`는 그중 유형을 알 수 있는 부분만 따로 센 값이다(영웅 스킬은 `mixed`라 유형별 칸에 들어가지 않는다).

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
| `examples/line_user_combo.json` | 시라호시 초월 + 라분·루치 2·후지토라 전설 + 아카이누 히든 + 모비딕호 + 방주맥심 (수정내역 29 예시) |

### 실제 출력 (발췌)

`node cli/ordsim.mjs examples/line_basic.json` (계산 수정 #1~#9 반영 후)

```json
"line": {
  "clear": true,
  "verdict": "65라 종료까지 55기 미만 유지",
  "final": {"remaining": 24, "lineRemaining": 24, "averageAb": 17.915987499999947},
  "rounds": [
    {"round": 60, "remaining": 11, "special": {"type": "boss", "result": "killed", "killSecond": 5}},
    {"round": 61, "remaining": 9,  "special": {"type": "frenzy", "result": "killed", "killSecond": 9.1}},
    {"round": 62, "remaining": 17, "special": {"type": "frenzy", "result": "killed", "killSecond": 9.1}},
    {"round": 63, "remaining": 17, "special": {"type": "frenzy", "result": "killed", "killSecond": 9.1}},
    {"round": 64, "remaining": 24, "special": {"type": "frenzy", "result": "killed", "killSecond": 9.1}},
    {"round": 65, "remaining": 24, "special": {"type": "boss", "result": "killed", "killSecond": 5.3}}
  ],
  "damage": {
    "lineTotal": 27478782160.07579,
    "bySource": {"D3": 3637177215.882181, "TR19": 22696177071.64459, "H2": 1145427872.549017}
  },
  "totals": {"lineSpawned": 210, "lineKilled": 186, "unitCount": 2}
}
```

`node cli/ordsim.mjs examples/line_low_cut_fail.json` — 61라 9초에 패배

```json
{"round": 60, "completed": true,  "remaining": 36, "special": {"type": "boss", "result": "survived"}},
{"round": 61, "completed": false, "remaining": 55, "failedSecond": 9, "special": {"type": "frenzy", "result": "unknown_round_failed"}},
{"round": 62, "reached": false, "special": {"type": "frenzy", "result": "not_reached"}}
```

`node cli/ordsim.mjs examples/single_lucci_hancock.json`

```json
"single": {
  "count": 2, "trials": 3000, "seed": 202323,
  "target": {"hp": 152024700, "armor": 181, "difficulty": "신", "gorosei": "없음", ...},
  "to15Seconds": 3.7038624793449664,
  "killSeconds": 5.2919717719033565,
  "finishFrom15Seconds": 1.9820799247008178,
  "remainingAt3": 41763999.51633802,
  "reference": {"danRatio": 1.5018628954332207, "endRatio": 1.4270047349855255}
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
- 라인은 data.json의 영웅 263종(흔함~신비, 특수 기물 포함)과 보조 4·조건형 3·삭제 3종을 지원한다. 공격·전투 효과가 없는 SP5 오타마만 미등록이다. 저등급·히든 다수는 2.323 툴팁에 수치가 없어 2.305 맵 값이다.
- 자원은 60라 시작 시 1회 만충 후 연속으로 쌓인다(`resourceMode`로 변경 가능).
- 아직 계산하지 않는 툴팁 효과(지속 방어력 감소, 아군 오라, 크리티컬 추가 피해, Z10 처형 등)는 `docs/수정내역.md`의 미적용 목록에 있다.
- 확률 스킬·아머브레이크·처형은 발동 기대값으로 나누어 적용한다.
- 단일 테스터는 단일·끝딜 유닛 10종만 지원한다.
- 스턴·슬로우 등 제어, 몹 이동·위치·사거리는 구현되지 않았다. 범위 피해는 `coverage`로 근사한다.
- 선택한 증폭 효과는 항상 걸려 있다고 가정한다. 발동 확률·지속시간·대상 조건은 판정하지 않는다.
- 서로 다른 저항·증폭 단계의 결합 순서는 곱셈으로 가정한다.
- 보스·광폭에 들어간 피해량은 엔진이 집계하지 않는다(처치 여부·시각만 보고).
- `clear`는 모델상 난이도별 패배 기준(지옥 70·신 55·악몽 50) 미만 유지이며 실제 클리어 보장이 아니다.

## 테스트

```bash
npm test            # test_single, test_support, test_v2, test_conditional, test_v3_mechanics, test_cli
node test_cli.mjs   # CLI 결과 = 엔진 직접 호출 결과 확인
```

`test_cli.mjs`는 예시 시나리오마다 엔진을 직접 호출한 결과와 CLI 결과(라운드별 잔존 수, 특수몹 처치 시각, 피해량, 삭제·마무리 횟수, 단일 테스터 시간)가 정확히 같은지 확인하고, 잘못된 입력이 종료 코드 2로 실패하는지 확인한다. `test_engine.mjs`는 저장소 밖 `../work/physical_cut_screen.json`이 있어야 해서 `npm test`에 넣지 않았다(`npm run test:legacy-engine`).
