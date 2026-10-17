# Generates E6.json, the data.json hero object for 비비 영원 (h057), docs/수정내역.md 21.
# Run: python3 -I scripts/gen_e6.py <out_dir>; evidence table: docs/E6_비비영원_근거.md.
# The repo copy also writes rate_without_move_shot (3연사·웨스턴 rates without 이동사격) used by the engine.
# Numbers: 2.323 ORDR tooltip (dist/ordr_units.json E6). Structure: 2.305 war3map.j / w3u / w3a / w3q.
import json, sys

OUT = sys.argv[1]
L = 10            # default 알라바스타 건 level (user option e6AlabastaLevel)
MOVE_SHOT = True  # default: 이동사격 cast whenever ready (needs L>=5)

# ---- form (2.305 w3u h057 + w3q R013, file-04 method) ----
ua1b, dice, gba2, gmo2, glvl = 40000, 1 * (1 + 1) / 2, 7000.0, 7000.0, 21
gba1, gmo1, ua1c = 0.20000000298023224, 0.14000000059604645, 0.7400000095367432
attack = ua1b + dice + gba2 + (glvl - 1) * gmo2
aps = (1 + min(gba1 + (glvl - 1) * gmo1, 4)) / ua1c

# ---- rates ----
PAUSE = 0.1 + 0.02 + 20 * 0.055 + 0.05           # 난사 BlzPauseUnitEx window (j:25508..25609)
r_mana_raw = aps / 151                            # 150 attacks to fill + 1 attack that casts (no +1 on it)
r_mana = 1 / (151 / aps + PAUSE)
uptime = 1 - r_mana * PAUSE
aps_eff = aps * uptime
CD3 = 5.0                                         # 2.323 "절대쿨다운 5초" (2.305 A0LH Ufa1 7)
CD_MOVE = 7.25                                    # [2.305 기준] A0LF acdn
r3_plain = 1 / (CD3 + 1 / aps_eff)
r3_reset = 2 / CD_MOVE                            # reset every 7.25 s -> fires at 0+ and 5+ in each window
r3 = r3_reset if (MOVE_SHOT and L >= 5) else r3_plain
r_move = 1 / CD_MOVE if (MOVE_SHOT and L >= 5) else 0.0
r_west = 0.25 * (aps_eff - r3 - r_mana)           # 25% only on attacks that are neither 3연사 nor 난사 casts
r_head = 0.10 * aps_eff                           # 10% on every attack event (outside the mana if/else)
hits3 = 4 if L >= 3 else 3

TT = 'dist/ordr_units.json E6'
def ev(index, rate, rate_kind, parts, **kw):
    e = {"code": "E6", "index": index, "rate": rate, "rate_kind": rate_kind, "parts": parts,
         "phase": None, "per_attack": kw.pop('per_attack', True)}
    e.update(kw)
    return e

events = []
# 1. 난사 (mana 150)
nl = 1 + 0.05 * L
events.append(ev("난사", r_mana, f"자원 150; 공격당 1+초당 0; 시작시 만충; 발동 공격은 마나 +1 없음(151타 주기) + 경직 {PAUSE:.2f}초",
    [["fixed", 300000.0 * nl, [["max", 0.10 * nl]], 0.0]],
    initial=True, resource_cost=150, target="random", picks=40, pick_range=925, center="self",
    nonline_parts=[["magic", 500000.0, [], 0.0]],
    level_formula={"parts": [["fixed", 300000.0, [["max", 0.10]], 0.0]], "level_mul": 0.05},
    source="2.323 툴팁 수치 + 2.305 난사 구조",
    note=("근거 [툴팁 E6] \"마나 150소모, 랜덤한 적 2명에게 횟수당 30만 + 전체체력 10%의 고정 데미지*20회 ▶ 보스 : 50만의 마법데미지\", "
          "\"난사 타수마다 단일 적에게 추가로 '전체체력 0.5% x 알라바스타 건 레벨' 고정데미지\". "
          "[2.305 j:82927-82930 wxM] 공격 시 마나==150이면 마나 0, TZ(난사) 실행(그 공격은 마나 +1·3연사·웨스턴 판정 없음). "
          "[j:25487-25615 NKM] 20단계(OX 2..21, 0.055초 간격) × 단계당 랜덤 적 2회(j:25545·25575 영웅 위치 925 범위 적 전체에서 GroupPickRandomUnit, 같은 대상 중복 가능), "
          "라인몹(Ofe: A902 보스·A903 광폭·A904 스토리·A911 미션 아님)은 (30만+최대체력 8%)×(1+0.05×레벨) CHAOS=고정(j:25553·25583), 그 외 50만 NORMAL=마법(j:25555·25585). "
          "레벨 보너스는 2.305 코드 구조 ×(1+0.05L)를 따랐다: 2.323 기본 10%에서 %부분 증가가 정확히 0.5%×L로 툴팁과 같고, 30만 부분도 1.5만×L 늘어난다(툴팁 직역 시 +0.5%×L 최대체력만). "
          "영웅 BlzPauseUnitEx(j:25508→25609) 약 1.27초 공격 불가 → hero.attack_uptime. 151 = 마나 150 충전 + 발동 공격 1회.")))
# 2. 3연사
m3 = 100000.0 * L
events.append(ev("3연사 라인", r3, f"절대쿨 5초, 쿨 끝난 첫 공격에 발동; 이동사격 시 쿨 초기화(7.25초마다 2회); {hits3}타",
    [["magic", m3 * hits3, [["max", 0.12 * hits3]], 0.0], ["fixed", 0.0, [["max", 0.015 * L * hits3]], 0.0]],
    target="single_line", center="target", per_proc_cap_maxhp=1.0,
    level_formula={"per_hit_parts": [["magic", 0.0, [["max", 0.12]], 0.0]],
                   "per_hit_parts_per_level": [["magic", 100000.0, [], 0.0], ["fixed", 0.0, [["max", 0.015]], 0.0]],
                   "hits": 3, "hits_by_level": {"3": 4}, "rate_without_reset": r3_plain},
    source="2.323 툴팁 수치 + 2.305 3연사 구조",
    note=("근거 [툴팁 E6] \"3연사 :: 단일 적에게 '10만 x 알라바스타 건 레벨' + 전체체력 12%의 마법데미지 x 3회 ▶ 보스 : 10만 x 알라바스타 레벨 마법데미지 ▶ 절대쿨다운 5초\", "
          "\"웨스턴 액션, 3연사, 헤드샷 발동시 단일 적에게 추가로 '전체체력 1.5% x 알라바스타 건 레벨' 고정데미지\". "
          "[2.305 j:82934-82941] 버프 B03P가 없으면 더미 e0KW가 자신에게 frostarmor(A0LH AUfa Ufa1 7초 = 2.305 쿨, 2.323은 5초) 후 jZ(3연사). "
          "[j:23615-23691 LhM] 공격 대상 1기에 매 타 같은 피해: 라인몹 10만×L + 최대 10% + L×1.5% 최대(j:23631, 2.305는 모두 CHAOS), 그 외 10만×L(j:23633). "
          "타수 3, A0L9 레벨 2(알라바스타 3레벨에서 +1, j:16191·16258)면 4타(j:23677) [2.305 기준, 2.323 툴팁은 3회만 표기]. "
          "알라바스타 1.5%×L은 2.305 코드에서 타마다 들어간다(발동당 1회가 아님). 피해 타입은 2.323 툴팁 '마법'을 따랐다(2.305는 고정) — 구조 충돌, NOTES 참조. "
          "한 발동이 최대체력을 넘으면 남는 타는 버려지므로 per_proc_cap_maxhp 1.0.")))
events.append(ev("3연사 특수", r3, f"3연사와 같은 rate; 보스·광폭(Ofe 거짓) {hits3}타",
    [["magic", m3 * hits3, [], 0.0]],
    target="target_special", center="target",
    level_formula={"per_hit_parts_per_level": [["magic", 100000.0, [], 0.0]], "hits": 3, "hits_by_level": {"3": 4}},
    source="2.323 툴팁 수치 + 2.305 3연사 구조",
    note="근거 [툴팁 E6] \"▶ 보스 : 10만 x 알라바스타 레벨 마법데미지\". [2.305 j:23633] Ofe 거짓(보스·광폭·스토리·미션)은 10만×L만. 광폭도 이 분기 [2.305 기준]."))
# 3. 웨스턴 액션
west_line = [["fixed", 750000.0, [["max", 0.14 + 0.015 * L]], 0.0]]
west_note = ("근거 [툴팁 E6] \"공격시 25% 확률로 공격 타겟 + 900범위 랜덤한 단일 적 타격 ▶ 랜덤한 단일 적 1.5초 스턴 및 75만 고정데미지 ▶ 라인몬스터에게 전체체력 14%의 추가 고정데미지\", "
             "\"웨스턴 액션 … 발동시 … '전체체력 1.5% x 알라바스타 건 레벨' 고정데미지\". [2.305 j:82943] 3연사 쿨 중인 공격에서만 15%(2.323 25%) 판정 → rate = 0.25×(실효 공속 − 3연사 rate − 난사 rate). "
             "[j:5936-6045 AHA] 공격 대상: 라인몹 75만+최대 10%+L×1.5% 최대, 그 외 75만(j:5955, CHAOS=고정, j:6002). 랜덤 1기: 영웅 위치 900 범위 적 전체에서 1기(j:5968, 공격 대상 포함 가능), 같은 식(j:5974, j:6033). "
             "스턴: 더미 e0FP의 A0LI(Awfb, adur 1.5, ahdu 1.5)를 두 번 모두 공격 대상(Ts+1)에 시전(j:5996·6027) — 랜덤 대상은 2.305 코드상 스턴 없음. 2.323 툴팁은 '랜덤한 단일 적 1.5초 스턴'이라 충돌, NOTES 참조.")
events.append(ev("웨스턴 액션 대상 라인", r_west, "공격당 0.25 (3연사·난사 발동 공격 제외)", west_line,
    target="single_line", center="target", stun={"normal": 1.5, "hero": 1.5, "single": True},
    level_formula={"parts": [["fixed", 750000.0, [["max", 0.14]], 0.0]], "parts_per_level": [["fixed", 0.0, [["max", 0.015]], 0.0]]},
    source="2.323 툴팁 수치 + 2.305 웨스턴 구조", note=west_note))
events.append(ev("웨스턴 액션 대상 특수", r_west, "공격당 0.25 (3연사·난사 발동 공격 제외)", [["fixed", 750000.0, [], 0.0]],
    target="target_special", center="target", stun={"normal": 1.5, "hero": 1.5, "single": True},
    source="2.323 툴팁 수치 + 2.305 웨스턴 구조", note=west_note))
events.append(ev("웨스턴 액션 랜덤", r_west, "공격당 0.25, 900범위 랜덤 1기", west_line,
    target="random", picks=1, pick_range=900, center="self", nonline_parts=[["fixed", 750000.0, [], 0.0]],
    level_formula={"parts": [["fixed", 750000.0, [["max", 0.14]], 0.0]], "parts_per_level": [["fixed", 0.0, [["max", 0.015]], 0.0]]},
    source="2.323 툴팁 수치 + 2.305 웨스턴 구조", note=west_note))
# 4. 헤드샷
events.append(ev("헤드샷", r_head, "공격당 0.1 (모든 공격)", [["magic", 525000.0, [], 0.0]],
    radius=450, center="target",
    source="2.323 툴팁 수치 + 2.305 헤드샷 구조",
    note=("근거 [툴팁 E6] \"공격시 10% 확률로 450범위 35만(x1~2)의 마법데미지\". x1~2 기대값 1.5 → 52.5만. "
          "[2.305 j:82947-82963] 마나 분기 밖이라 모든 공격에서 10%, oCM 450 at 공격 대상 위치, 35만×U(1,2) NORMAL=마법 [wts STRING 5572 '마법데미지'와 대응].")))
events.append(ev("헤드샷 알라바스타", r_head, "헤드샷과 같은 rate", [["fixed", 0.0, [["max", 0.015 * L]], 0.0]],
    target="single_line", center="target",
    level_formula={"parts_per_level": [["fixed", 0.0, [["max", 0.015]], 0.0]]},
    source="2.323 툴팁 수치 [추정 구조]",
    note=("근거 [툴팁 E6] \"웨스턴 액션, 3연사, 헤드샷 발동시 단일 적에게 추가로 '전체체력 1.5% x 알라바스타 건 레벨' 고정데미지\". "
          "2.305에는 헤드샷이 이 목록에 없다(wts:36856 '웨스턴액션, 3연사'만). 대상은 웨스턴·3연사의 2.305 구조를 따라 공격 대상, 라인몹만 [추정].")))
events.append(ev("헤드샷 강화 라인", r_head, "헤드샷과 같은 rate; 알라바스타 7레벨 이상", [["fixed", 0.0, [["max", 0.25]], 0.0]],
    target="single_line", center="target", level_formula={"min_level": 7},
    source="2.305 기준",
    note=("[2.305 기준] 2.323 툴팁에 없음. [j:16195·16264] 알라바스타 7레벨에서 A0LC 레벨 2, [j:82966-82971] 공격 대상이 라인몹이면 최대체력 25% CHAOS=고정, "
          "아니면 100만 NORMAL=마법. wts STRING 5573 \"추가데미지 : 단일 적 전체체력 25% 고정데미지 ▶ 보스 / 광폭화 / 스토리에게는 100만 마법데미지\".")))
events.append(ev("헤드샷 강화 특수", r_head, "헤드샷과 같은 rate; 알라바스타 7레벨 이상", [["magic", 1000000.0, [], 0.0]],
    target="target_special", center="target", level_formula={"min_level": 7},
    source="2.305 기준", note="[2.305 기준] j:82970, wts STRING 5573. 2.323 툴팁에 없음."))
# 5. 이동사격
ml = 1 + 0.1 * L
if r_move:
    events.append(ev("이동사격", r_move, "쿨 7.25초마다 시전 [2.305 기준], 알라바스타 5레벨 이상; 시전 시 3연사 쿨 초기화",
        [["fixed", 250000.0 * ml, [["current", 0.07 * ml]], 0.0]], per_attack=False,
        target="random", picks=12, pick_range=925, center="self", nonline_parts=[["magic", 400000.0, [], 0.0]],
        resets_event="3연사",
        level_formula={"parts": [["fixed", 250000.0, [["current", 0.07]], 0.0]], "level_mul": 0.1, "min_level": 5},
        source="2.323 툴팁 수치 + 2.305 이동사격 구조",
        note=("근거 [툴팁 E6] \"랜덤한 적 2명에게 25만 + 현재체력 7%의 고정데미지 x 6회 ▶ 알라바스타 건 레벨 x 10%씩 피해량 증가 ▶ 보스 / 스토리에겐 40만의 데미지\". "
              "2.323 툴팁에는 발동 방식이 없다. [2.305] A0LF(ANcl, Q, acdn 7.25, aran 1600 순간이동), 알라바스타 5레벨에서 UnitAddAbility(j:16194·16262). "
              "[j:74596-74614 q8M] 시전 시 B03P 제거(=3연사 쿨 초기화, j:74609) 후 cZ. [j:20832-20945 KDA] 6단계 × 랜덤 적 2회(영웅 위치 925, j:20875·20905), "
              "라인몹 (25만+현재체력 7%)×(1+0.1×L) CHAOS=고정(j:20883·20913), 그 외 40만 NORMAL=마법(j:20885·20915). "
              "사용 방식은 플레이어 수동 시전이라 '쿨마다 즉시 사용'은 [추정](TR19 우솝해머와 같은 규칙). 시전 지점 이동(최대 1600)은 무시하고 같은 자리 시전으로 본다.")))

hero = {
    "code": "E6", "name": "비비", "grade": "영원한", "focus": "마법·고정 혼합",
    "own_range": True,
    "attack_uptime": uptime,
    "alabasta": {"option": "e6AlabastaLevel", "default": L, "min": 1, "max": 10, "move_shot_option": "e6MoveShot", "move_shot_default": MOVE_SHOT,
                 "note": ("알라바스타 건(A0LE) 레벨은 사용자 선택. 강화 시도 1회 = 목재 2 + 기본랜덤위습 3, 성공확률 (90−9×현재레벨)% (2.305 j:16248 '90-L*9<Random(1,100)이면 실패', 툴팁 1레벨 81% … 9레벨 9%). "
                          "기본 10(Max): 다른 영웅을 풀업(업그레이드 21단계, Z2 20레벨)으로 계산하는 것과 맞춘 값. 레벨 해금 [2.305 기준]: 3레벨 3연사 4타, 5레벨 이동사격, 7레벨 헤드샷 강화. "
                          "rate·parts는 기본 레벨로 풀어 둔 값이고 level_formula에 레벨 식이 있다.")},
    "forms": [{
        "rawcode": "h057", "attack": attack, "aps": aps, "attack_type": "pierce", "splash": 0, "splash_radius": 0,
        "rounds": {"60": 0.75, "61": 1.25, "62": 1, "63": 1.25, "64": 0.9, "65": 0.9},
        "crit": [0.1, 5],
        "crit_note": ("근거 [툴팁 E6] \"알라바스타 건 :: 공격시 10% 확률로 5배 크리티컬 및 광폭화 페널티 무시\". [2.305 w3a A0LE] AHbh Hbh1 10(확률) Hbh2 5(배율). "
                      "광폭화 페널티는 엔진에 없는 규칙이라 '무시'는 효과 없음."),
        "cooldown": ua1c, "range": 900,
        "note": ("[2.305 기준] w3u h057(hrif): ua1b 40000, ua1d 1, ua1s 1(주사위 평균 1), ua1c 0.74, ua1r 900, ua1w missile(스플래시 없음), ua1t 미설정 → hrif 기본 관통(pierce), umpm 150, umpr 미설정(재생 0), upgr R013. "
                 f"w3q R013: gba1 0.2, gmo1 0.14, gba2 7000, gmo2 7000, glvl 21 → 공격력 40000+1+7000+20×7000 = {attack:.0f}, 공속 (1+min(0.2+20×0.14,4))/0.74 = 4/0.74 = {aps:.4f}.")
    }],
    "events": events,
    "url": "https://ordr.kr/character/E6",
}
west_plain = 0.25 * (aps_eff - r3_plain - r_mana)
for e in events:
    if e["index"].startswith("웨스턴"): e["rate_without_move_shot"] = west_plain
    if e["index"].startswith("3연사"):
        e["rate_without_move_shot"] = r3_plain
        (e.get("level_formula") or {}).pop("rate_without_reset", None)
    e["note"] = "수정내역 21: " + e.get("note", "")
hero["alabasta"]["note"] = "수정내역 21: " + hero["alabasta"]["note"]
def tidy(x):
    if isinstance(x, float): return round(x, 12) if abs(x) < 10 else round(x, 6)
    if isinstance(x, list): return [tidy(v) for v in x]
    if isinstance(x, dict): return {k: tidy(v) for k, v in x.items()}
    return x
json.dump(tidy(hero), open(f"{OUT}/E6.json", "w"), ensure_ascii=False, indent=1)
print(json.dumps({"attack": attack, "aps": aps, "pause": PAUSE, "r_mana_raw": r_mana_raw, "r_mana": r_mana, "uptime": uptime,
                  "aps_eff": aps_eff, "r3_plain": r3_plain, "r3_reset": r3_reset, "r3": r3, "r_west": r_west, "r_head": r_head, "r_move": r_move}, indent=1))
# expected attempts table
acc = 0
for lv in range(1, 10):
    p = (90 - 9 * lv) / 100; acc += 1 / p
    print(f"to L{lv+1}: p={p:.2f}, cumulative expected attempts {acc:.2f} (lumber {2*acc:.1f}, wisps {3*acc:.1f})")
