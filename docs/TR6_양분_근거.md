# TR6 료쿠규 초월 — 양분(nutrient) 스택 조사

> 저장소 반영: `dist/data.json` TR6 `nutrients`, 엔진 `dist/engine_v3.mjs`(양분 카운터), 옵션 `tr6Nutrients`. docs/수정내역.md 22. 아래는 조사 원문이다(제안 JSON은 data.json에 반영됨).

Map-internal code: 2.305 `war3map.j:58179` maps unit H0BL to the string `TR17`. ORDR calls it TR6. Forms: H0BL is the base form and H0BO is the 숲인간 form (metamorphosis A15F `AEme`, Eme1=H0BL, Emeu=H0BO).

## 1. 2.323 ORDR tooltip (`dist/ordr_units.json` TR6 `base_lines`), every 양분/스택 line, verbatim

```
▶ 발동 시 양분 스택을 1 획득                                   (under "마나 130소모, 숲인간으로 변신")
▶ 지능 1당 데미지 14,500 증가 / 양분스택당 데미지 10,000 증가  (삼림화 "초당 145만(x1~1.5)")
▶ 10% 확률로 양분 스택을 1 획득                                (under "공격시 5% 확률로 자신 주변 950범위 75(x1~1.5)만")
▶ 양분스택당 데미지 1,825씩 증가                               (same skill)
◎ 양분 스택이 쌓일수록 자신의 크기 및 스킬 데미지 증가
▶ 10스택당 숲인간형태 공격력이 7,000씩 (최대 56,000) 증가
▶ 10스택당 숲인간 형태의 크기가 커지며 공격속도가 7% (최대 56%) 증가
▶ 최대 80스택
```
`trait_lines` is empty. `base_info.buff_lines` has only "[버프/디버프] - 방어력 감소 35", which does not mention 양분.

The 2.305 strings say the same (`war3map.wts` STRING 3024 l.18805/18811, STRING 3074 l.19143-19144, STRING 4606 l.30001-30004). The 2.305 strings differ from 2.323 here:
- 2.305 mana is 115; 2.323 mana is 130.
- 2.305 전방위 흡수 is "90(x1~1.5)만"; 2.323 is 75만.
- 2.305 STRING 3074 also has "◎추가효과: 발동시 마나 5 회복" and "◎추가효과2: 금증숲숲 상태에서 발동 확률이 2배가 되며 데미지가 25% 증가". These are absent from the 2.323 tooltip.

## 2. 2.305 structure (war3map.j / w3a / w3u / w3t)

### Storage: one item per player, not per unit
- Item `I004` (흡수한 영혼, tip "흡수한 양분"). Its charges hold the stack count.
- `war3map.j:737` declares `item array QJ`, indexed by **player id**.
- `LRA` (`:22002-22042`, bound via `X4` to the combine chat command "신해군대장초록소" / "ryokugyu tr", `:91501-91502`, `:86917`) runs on every successful combine. It creates a new I004 with `SetItemCharges(...,1)`, stores it in `QJ[player]` and gives it to the new unit. **A fresh TR6 therefore starts at 1 stack, not 0.**
- Consequence: all TR6 copies of one player read and write the same counter `QJ[player]`. Each new combine repoints `QJ[player]` to a new item with 1 charge, which resets the shared counter to 1. The old copy's item stays in its inventory but is no longer read.
- `QJ` appears 18 times, all in `:14735-14741`, `:21494-21528`, `:22033-22036` and `:81544-81548`. Nothing decrements or resets the counter at round start, so stacks **persist for the rest of the game** (until another combine). The cap is checked as `<80` before every `+1`.

### Ways to gain stacks (no kill condition anywhere)
| # | Trigger | Code | Gain |
|---|---|---|---|
| G1 | Each transformation (삼림화 cast, `GGe` via `TriggerExecute(VJ)`) | `:14740-14742` | +1 (if <80) |
| G2 | Base-form (H0BL) attack: 5% 전방위 흡수 proc (`AKA(1,100)<=5`), then an inner 10% roll | `Kye` `:21508`, `:21526-21530` | +1 with 10% chance per proc |
| G3 | Transformed-form (H0BO) attack: **10%** 전방위 흡수 proc (`AKA(1,100)<=10`), then an inner 10% roll | `vZe` `:81518`, `:81546-81550` | +1 with 10% chance per proc |

Hookup: `aGM($4830424c,o4)` registers H0BL attacks to `Kye`, and `aGM($4830424f,s4)` registers H0BO attacks to `vZe` (`:91503-91504`, `:86918-86919`, event EVENT_PLAYER_UNIT_ATTACKED). Stack gain depends only on attacks and transformations. Kills and last hits play no part.

### What each stack adds
- **삼림화 (data event index "2")**, `GGe` `:14735`: the snapshot `ps[2] = charges*10000`, taken at cast **before** the +1 at `:14741`. The INT term `ps[3] = INT*14500` is snapshotted the same way. Tick callback `nMh` `:71832`: `AyM(src, mob, 1450000 + ps2 + ps3, 1., 1.50, CHAOS, NORMAL)`. `AyM` (`:5318`) multiplies the whole sum by `V6e(1,1.5)`. The added damage is therefore flat **+10,000 × S_cast per tick per mob × U(1,1.5)**, an expected +12,500 × S_cast.
- **전방위 흡수 (data event index "3")**:
  - Base form, `:21524`: `oCM(..., 925 range, 1000000 + charges*1825, 1., 1.50)`. 2.305 code uses 1,000,000 and the 2.305 wts says 90만; the conflict is internal to 2.305.
  - Transformed form, `:81544`: `1.25*(900000 + charges*1825)`.
  - Per stack: flat **+1,825 × S × U(1,1.5)**, an expected +2,281.25 × S per proc. In 2.305 the transformed form multiplies this by a further 1.25 (2,851.56).
- **숲가꾸기 (event "4")**: `cJ`→`irA`, 14% in 2.305 (`:21533`, `:81516`). **No stack term.**
- **Transformed attack and attack speed** come from dummy buffs set at transform time. In `Kye` `:21482-21503`, once mana is at least 115, the code:
  1. creates dummy `h03D` (w3u `uabi = A16S,A15R,Aloc,Amrf,Avul`);
  2. sets `L = 1 + charges/10` (integer division, levels 1..9) on `A16S` (`:21495`) and `A15R` (`:21498`), from the **pre-increment** count;
  3. issues `battleroar` (A16S) and `bloodlust` (A15R) on TR6, then `metamorphosis`, then `TriggerExecute(VJ)` (where G1's +1 happens).

  The dummy abilities in w3a:
  - `A16S` (base `ANbr` Battle Roar): `Nbr1` = 0/7000/14000/…/56000 for levels 1..9, i.e. **flat +7,000 × floor(S/10)**. `adur`/`ahdu` 7 s, buff `B07U`, `aare` **5000**, `atar` "invulnerable,sapper,ground,player".
  - `A15R` (base `Ablo` Bloodlust): `Blo1` = 0/.07/…/.56, i.e. **+0.07 × floor(S/10) attack-speed bonus**. `Blo3` scale is 1.00 to 1.96, `adur` 7 s, buff `B07B`, cast on TR6 only (`IssueTargetOrderById(mye,"bloodlust",Nye)`).
  - Both last 7 s, the same as the transform duration (A15F `ahdu` 7). In practice the bonus covers the whole transformed window and is fixed from the stack count at cast.
- **Structural finding (conflicts with the tooltip wording):** the attack bonus is Battle Roar with a 5000 area that targets the owner's ground units flagged "invulnerable". All 43 hero forms in `data.json` that match a 2.305 w3u rawcode carry `Avul`. The +7,000 × floor(S/10) therefore most likely buffs **every unit of the player within 5000, not only the 숲인간 form**. The 2.323 tooltip only says "숲인간형태 공격력". Multiple TR6 roars share buff `B07U`, so they overwrite each other and do not stack.
- Other 2.305 vs 2.323 structural and number gaps, which are not 양분-specific but affect event 3:
  - In 2.305 the transformed form doubles the 전방위 흡수 chance (10%) and multiplies its damage by 1.25. The 2.323 tooltip omits this. `data.json` event 3 uses a flat 5% and 75만 in both forms.
  - 전방위 흡수 also gives +5 mana in 2.305.
  - 숲가꾸기 is 14% in 2.305 and 15% in 2.323.

## 3. Engine fit (dist/engine_v3.mjs)
- `formAt` window for TR6: `[7, 130, .25]`. The period is `7 + 130/(aps_base + .25)` = 30.95 s, so about 1.034 transforms per 32 s round. `inWindow` opens at g=0 in the `start` resource mode.
- Attack: `heroAttack = form.attack*(1+red+attack_pct) + attack_flat`. The roar bonus is a WC3 green flat bonus, so add it to `attack_flat`, not `attack_pct`.
- Aps: `aps = min(5, aps*form.cooldown + bonus)/form.cooldown` (line 489). Bloodlust's Blo1 is exactly such an IAS bonus. With H0BO (aps 5.649, cooldown 0.77) at 80 stacks: min(5, 4.35+0.56)/0.77 = **6.377** (was 5.649).
- Events: data `index` "2" (삼림화, phase `trans`, flat part 1,812,500 = 145만 × 1.25) and "3" (전방위 흡수, flat 937,500 = 75만 × 1.25, per_attack). Event "4" does not scale.

## 4. Model proposal
State `S` holds one counter **per player**, shared by every TR6 copy in the simulation. It starts at `options.tr6Nutrients` (0–80, user input) at round 60, global time 0, and is a fractional expected value.

Gain, evaluated every 0.1 s step, cap 80:
- (G1) +1 at each transform start. In the step where `formAt(...).transformed` turns false to true, first snapshot `S_cast = S`, then set `S = min(80, S+1)`. With several copies, each copy's transform adds +1.
- (G2/G3) `dS += 0.1 × p × aps × 0.1` per step while TR6 has a target. Use p = 0.05 (2.323 tooltip) in both forms. Optional p_trans = 0.10 under 2.305 structure (flagged conflict).
- Expected rate: about 1.88 stacks per 32 s round (2.323 numbers), or 2.08 with the 2.305 transformed doubling. That is roughly +11 to +12 over rounds 60–65.

Effects (L = floor(S_cast/10), S_cast = the stack count at the most recent transform start, before its +1):
- Transformed window, TR6 attack: `attack_flat += 7000 × L`. If the roar is applied team-wide (2.305 structure), every own unit gets `+7000 × max_L over active TR6 roars` while a roar window is open.
- Transformed window, TR6 aps: bonus `+0.07 × L` in `aps = min(5, aps×cooldown + bonus)/cooldown`. This is applied alongside `u.buffs.aps`, so the full bonus is `u.buffs.aps + 0.07L`.
- Event "2": add flat `10000 × 1.25 × S_cast` = **12,500 × S_cast** to the physical part, per tick.
- Event "3": add flat `1825 × 1.25 × S` = **2,281.25 × S** (current S) to the physical part. Under 2.305 structure the transformed form would get a further ×1.25.
- Multiple copies: the counter is shared (2.305 `QJ[player]`). Copies do **not** have separate stacks. Bloodlust is per TR6; the roar is the same buff, so it does not stack.

Approximations and flags:
- Using floor() on a fractional expected S is an approximation. It is the true step structure; linear S/10 would be smoother but would overstate the bonus below each step.
- Kills do not matter, so no kill attribution is needed.

Recommended default for `tr6Nutrients`: **0** [추정; user input]. 0 represents a freshly combined unit (the game actually starts it at 1) and keeps existing results nearly unchanged. Reaching 80 stacks by round 60 would need about 42 rounds of continuous attacking after the combine, at about 1.9 per round. A user who knows the combine round R can enter about `1 + 1.9 × (60 − R)` [추정].
