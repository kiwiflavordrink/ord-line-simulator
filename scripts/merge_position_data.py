"""Merge the position-model data (skill radius/center, stuns, slows, attack ranges, line path)
into dist/data.json. Inputs are the per-group extraction files described in docs/수정내역.md #16;
every value keeps its tooltip quote and 2.305 reference in the event note.

Usage: python3 scripts/merge_position_data.py <dir with g1..g4.json, path.json, ranges.json>
"""
import json, sys
from pathlib import Path

src = Path(sys.argv[1])
path = Path(__file__).resolve().parent.parent / 'dist' / 'data.json'
data = json.loads(path.read_text(encoding='utf-8'))
heroes = {h['code']: h for h in data['heroes']}
ranges = json.loads((src / 'ranges.json').read_text(encoding='utf-8'))

def short(text, n=160):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= n else text[:n] + '…'

def add_note(e, text):
    e['note'] = (e['note'] + ' / ' if e.get('note') else '') + text

def stun_of(raw):
    if not raw:
        return None
    out = {'normal': raw.get('normal'), 'hero': raw.get('hero'), 'single': bool(raw.get('single'))}
    if raw.get('boss') is not None:
        out['boss'] = raw['boss']
    if out['hero'] is None:
        out['hero'] = out['normal']  # unknown hero duration: same as normal, recorded in the note
    return out if out['normal'] else None

def slow_of(raw):
    if not raw or raw.get('value') is None or raw.get('duration') is None:
        return None
    out = {'value': min(1.0, float(raw['value'])), 'duration': raw['duration']}
    if raw.get('hero_duration') is not None:
        out['hero_duration'] = raw['hero_duration']
    return out

skipped, added = [], []
for group in ('g1', 'g2', 'g3', 'g4'):
    gpath = src / f'{group}.json'
    if not gpath.exists():
        continue
    for code, info in json.loads(gpath.read_text(encoding='utf-8'))['heroes'].items():
        hero = heroes.get(code)
        if hero is None:
            continue  # supports / conditional units are hard-coded in the engine
        if info.get('enemy_slow_auras'):
            hero['enemy_slow_auras'] = [{'id': a['id'], 'value': a['value'], 'range': a['range'],
                                        'note': short(a.get('src') or a.get('note'), 200)} for a in info['enemy_slow_auras']]
        by_index = {e['index']: e for e in hero['events']}
        for index, f in (info.get('events') or {}).items():
            e = by_index.get(index)
            if e is None or not f:
                continue
            if f.get('radius'):
                e['radius'] = f['radius']
            if f.get('center'):
                e['center'] = f['center']
            st, sl = stun_of(f.get('stun')), slow_of(f.get('slow'))
            if st:
                e['stun'] = st
            if sl:
                e['slow'] = sl
            if f.get('radius') or st or sl:
                bits = [f"범위 {f.get('radius')}" if f.get('radius') else '', f"중심 {f.get('center')}" if f.get('center') else '',
                        f"스턴 {st['normal']}초(보스·광폭 {st.get('boss', st['hero'])}초)" if st else '',
                        f"이속 −{int(sl['value']*100)}% {sl['duration']}초" if sl else '']
                add_note(e, '수정내역 16: ' + ', '.join(b for b in bits if b)
                         + f". 근거 {short(f.get('quote'))} [{short(f.get('map'), 120)}] src {f.get('src')}")
        # Stuns without a damage event: add stun-only events when the 2.323 tooltip confirms them.
        extras = info.get('unlisted_stuns') or info.get('unmodeled_stuns') or info.get('extra_stuns') or []
        for x in extras:
            raw = x.get('stun') or {k: x.get(k) for k in ('normal', 'hero', 'single', 'boss') if x.get(k) is not None}
            st = stun_of(raw)
            chance, name = x.get('chance'), x.get('skill') or x.get('name') or short(x.get('desc'), 30)
            unit = x.get('unit')
            if not st or not chance or x.get('src') != '2.323' or (unit and code != 'E10'):
                skipped.append(f'{code} {name}: ' + ('2.305 전용' if x.get('src') != '2.323' else '소환수 공속 미상' if unit else '확률·지속 미상'))
                continue
            phase = 'trans' if unit else None  # E10 하쿠바 attacks only while transformed
            aps = hero['forms'][0]['aps']
            ev = {'code': code, 'index': f'스턴 {name}', 'rate': chance * aps, 'rate_kind': f'공격당 {chance:g}',
                  'parts': [], 'phase': phase, 'per_attack': True, 'stun': st,
                  'radius': x.get('radius'), 'center': x.get('center') or 'target',
                  'target': 'single' if st['single'] else None,
                  'source': '2.323 툴팁 수치 + 2.305 스턴 구조',
                  'note': f"수정내역 16: 피해 이벤트가 없는 스턴. 근거 {short(x.get('quote'))} [{short(x.get('map'), 120)}]"}
            hero['events'].append({k: v for k, v in ev.items() if v is not None})
            added.append(f'{code} {name}')

for hero in data['heroes']:
    for form in hero['forms']:
        if ranges.get(form['rawcode']):
            form['range'] = ranges[form['rawcode']]

p = json.loads((src / 'path.json').read_text(encoding='utf-8'))
loop = [[w['x'], w['y']] for w in p['waypoints']]
berserk = p['specials']['berserk']['spawn']
data['line_path'] = {
    'loop': loop,
    'mob_speed': 300, 'boss_speed': 245, 'min_speed': 89,
    'frenzy': {'shuttle': [[berserk['x'], berserk['y']], [-5184.0, 3456.0]]},
    'support_range': 700, 'support_splash': 300, 'default_radius': 450,
    'note': ('2.305: 라인몹 Fq 중심 생성(j:36687-36704), 이동 Fq→Oq→Zq→Hq→Fq (j:56919·80949·67931·79253), '
             '이속 300 (보스 245, w3u o02C/o02B), MinUnitSpeed 89 (war3mapMisc). 광폭은 oq↔sq 왕복 (j:49756·23613). '
             '모든 유닛은 라인몹 생성 지점(Fq)에 둔다 (사용자 결정). support_range·support_splash·default_radius는 [추정]: '
             '보조·레드포스호·조건형 유닛의 사거리와 범위 자료가 없는 이벤트의 기본값.')}

path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
print('added stun events:', len(added)); [print('  +', a) for a in added]
print('skipped:', len(skipped)); [print('  -', s) for s in skipped]
