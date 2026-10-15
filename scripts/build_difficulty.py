"""Add the difficulty (지옥·신·악몽) and 오로성 tables to dist/data.json (docs/수정내역.md #19).

Structure and base unit stats: 2.305 map (war3map.j difficulty branch j:36745-36953, w3q upgrades,
w3u units o02G/o026/o025/o027/o00K/o02H, bosses o02C/o02B). Numbers that ORDR 2.323 publishes
(difficulty common HP/regen, 오로성 values) come from https://ordr.kr/ and /guides/gorosei.
The 신 rows equal the existing data.rounds / data.boss / data.frenzy (checked below).

Usage: python3 scripts/build_difficulty.py
"""
import json
from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'dist' / 'data.json'
data = json.loads(path.read_text(encoding='utf-8'))

# 2.305 w3u: line unit per round -> (uhpm, udup = armor per R00J level); boss -> (uhpm, udup per R00O level).
LINE = {'60': (12450000, 10), '61': (13582115, 10), '62': (14120000, 9),
        '63': (15610000, 10), '64': (16610000, 10), '65': (16210000, 10)}
BOSS = {'60': (12750000, -50), '65': (13595000, -55)}
# w3u udef (base armor), for the optional 2.305 armor formula udef + udup x level (option armorModel 'map').
LINE_DEF = {'60': 70, '61': 76, '62': 81, '63': 84, '64': 80, '65': 81}
BOSS_DEF = {'60': 372, '65': 395}  # + A0RR own armor aura +10
# 2.305 upgrades per difficulty (Player 6): line HP = uhpm x (1 + R00W + R00A), boss = uhpm x (1 + boss upgrade),
# armor levels R00J (line) / R00O (boss), R024 flat speed +29 per level, difficulty aura A0Z1/A0Z2/A0Z3 (AUau).
DIFF = {
    '지옥': dict(ne=4, line=1 + 5.86 + 1.0, boss=1 + 4.5, r00j=7, r00o=1, r024=2, aura=.12,
                defeat=70, magic_level=16, frenzy_aura=None, stun_resist=False,
                common={'hp': 0, 'regen': 0}),
    '신': dict(ne=5, line=1 + 6.67 + 1.4, boss=1 + 7.25, r00j=10, r00o=1, r024=3, aura=.25,
              defeat=55, magic_level=16, frenzy_aura={'armor': 5, 'regen': 1000000}, stun_resist=True,
              common={'hp': 5000000, 'regen': 250000}),
    '악몽': dict(ne=6, line=1 + 7.48 + 1.5, boss=1 + 8.5, r00j=11, r00o=0, r024=3, aura=.25,
                defeat=50, magic_level=11, frenzy_aura={'armor': 10, 'regen': 1200000}, stun_resist=True,
                common={'hp': 10000000, 'regen': 500000}),
}
god = DIFF['신']
out = {}
for name, d in DIFF.items():
    rounds, boss, frenzy = {}, {}, {}
    for r, (hp, udup) in LINE.items():
        base_hp, base_armor, kind = data['rounds'][r]
        line_hp = int(hp * d['line'] + 1e-6)
        # Armor: the existing 신 value plus udup x (R00J level difference) (2.305 w3u udup).
        rounds[r] = [line_hp, base_armor + udup * (d['r00j'] - god['r00j']), kind]
        if name == '신':
            assert line_hp == base_hp, (r, line_hp, base_hp)
        if r in data['frenzy']:
            frenzy[r] = line_hp
    for r, (hp, udup) in BOSS.items():
        base_hp, base_armor = data['boss'][r]
        boss_hp = int(hp * d['boss'] + 1e-6)
        boss[r] = [boss_hp, base_armor + udup * (d['r00o'] - god['r00o'])]
        if name == '신':
            assert boss_hp == base_hp, (r, boss_hp, base_hp)
    armor_map = {'line': {r: LINE_DEF[r] + udup * d['r00j'] for r, (_, udup) in LINE.items()},
                 'boss': {r: BOSS_DEF[r] + udup * d['r00o'] + 10 for r, (_, udup) in BOSS.items()},
                 'note': '수정내역 20: 2.305 공식 udef + udup×레벨(R00J/R00O), 보스는 자체 방어 오라 A0RR +10 포함. 신 기존 값과 62라(171 vs 181)·60라 보스(332 vs 327)가 다르다.'}
    out[name] = {
        'rounds': rounds, 'boss': boss, 'frenzy': frenzy, 'armor_map': armor_map, 'defeat': d['defeat'],
        'magic_level': d['magic_level'], 'speed': {'aura': d['aura'], 'line_flat': 29 * d['r024']},
        'frenzy_aura': d['frenzy_aura'], 'stun_resist': d['stun_resist'], 'common': d['common'],
        'gorosei': name != '지옥',
        'note': (f"[2.305 기준] ne=={d['ne']}: 라인 HP = uhpm×{d['line']:.2f}, 보스 HP = uhpm×{d['boss']:.2f} "
                 f"(R00W·R00A / 보스 업그레이드), 방어 = 신 값 + udup×(R00J {d['r00j']}−10) / 보스 udup×(R00O {d['r00o']}−1), "
                 f"이속 고정 +{29 * d['r024']}(R024 rmvx, 라인·광폭) + 난이도 오라 {int(d['aura'] * 100)}%(AUau), "
                 f"패배 {d['defeat']}기(bM, j:46792, 50라 종료 시 데스카운트 0 j:47570), A04Q {d['magic_level']}레벨. "
                 f"공통 HP·재생은 2.323 ORDR 난이도 툴팁 "
                 + ('"별도의 오로성 효과 및 스탯 페널티가 없습니다."' if name == '지옥' else
                    f'"모든 적 유닛들의 체력 {d["common"]["hp"] // 10000}만, 체력 재생 {d["common"]["regen"] // 10000}만 증가"')
                 + (' 광폭 오라·저항성 스킨(R01R) 없음.' if name == '지옥' else ''))}

data['difficulties'] = out
# 2.323 ORDR /guides/gorosei (values) + 2.305 j:54329-54429 (structure: Player 6 aura/upgrades after round 50).
data['gorosei'] = {
    '나스쥬로': {'신': {'enemy_speed': .10, 'ally_aps': -.10, 'line_hp': 10000000},
             '악몽': {'enemy_speed': .15, 'ally_aps': -.15, 'line_hp': 15000000},
             'note': '2.323 "모든 적 유닛 이동속도 10% 증가, 모든 아군 유닛 공격속도 10% 감소, 라인 몬스터 체력 1,000만 증가"(악몽 15%·15%·1,500만). '
                     '2.305 구조: A13F(AOae 적 이속 %, 난이도 오라와 가산), A13E(아군 공속), R00S(라인 고정 HP).'},
    '워큐리': {'신': {'armor': 10, 'magic_levels': 10, 'boss_hp': 10000000},
            '악몽': {'armor': 15, 'magic_levels': 15, 'boss_hp': 15000000},
            'note': '2.323 "모든 적 유닛 방어력 10 증가, 마법방어력 10% 증가, 보스 몬스터 체력 1,000만 증가"(악몽 15·15%·1,500만). '
                    '2.305 구조: A13D(AHad 방어 오라), kM −레벨(A04Q 1레벨 = 1%p, 하한 1레벨), R01W(보스 고정 HP).'},
    '새턴': {'신': {'ally_attack': -.20, 'explosive': -.07, 'regen': 225000},
           '악몽': {'ally_attack': -.30, 'explosive': -.10, 'regen': 350000},
           'note': '2.323 "모든 아군 유닛 공격력 20% 감소, 폭발형 데미지 7% 감소, 모든 적 유닛 체력 재생 22.5만 증가"(악몽 30%·10%·35만). '
                   '2.305 구조: A13G(ACac 공격력 오라, 다른 공격력 오라와 가산), TM −레벨(적 A11S 폭발형 배율), A0Z2/A0Z3 재생.'},
}
# 2.305 w3u uhpr: o026 (61라) 45,000/s; other 60-65 line units 0. Boss 50,000/s is already in the engine.
data['round_regen'] = {'61': 45000}
path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
for k, v in out.items():
    print(k, v['rounds']['65'], v['boss']['65'], v['defeat'])
