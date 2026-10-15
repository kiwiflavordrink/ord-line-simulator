"""Check that tooltip sentences quoted in dist/data.json notes still appear in the ORDR tooltips
(dist/ordr_units.json). Quotes are the "..." parts of each event/hero note; a quote matches when its
words appear in the same order in the hero's tooltip text (whitespace and ▶/◎/- markers ignored,
"…" splits a quote into pieces that must each match). docs/수정내역.md 28.

Usage: python3 scripts/check_tooltip_quotes.py [--verbose]
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
units = {u['code']: u for u in json.loads((ROOT / 'dist/ordr_units.json').read_text(encoding='utf-8'))['units']}
data = json.loads((ROOT / 'dist/data.json').read_text(encoding='utf-8'))

def norm(t):
    t = re.sub(r'[▶◎•·]|\[버프/디버프\]', ' ', t)
    t = re.sub(r'(^|\s)-\s', ' ', t)
    return re.sub(r'\s+', '', t)

def tooltip(code):
    u = units.get(code)
    if not u:
        return ''
    lines = u['base_lines'] + u['trait_lines'] + u['base_info'].get('buff_lines', []) + (u.get('trait_info') or {}).get('buff_lines', [])
    return norm(' '.join(lines))

total = bad = 0
problems = []
for h in data['heroes']:
    text = tooltip(h['code'])
    notes = [(e['index'], e.get('note', '')) for e in h['events']]
    for idx, note in notes:
        for mt in re.finditer(r'"([^"]{6,})"', note):
            q, before = mt.group(1), note[max(0, mt.start() - 30):mt.start()]
            # Only quotes cited as the ORDR tooltip: after "근거"/"툴팁", not after a 2.305 source (wts/STRING/2.305 툴팁).
            if not re.search(r'근거|툴팁|2\.323', before) or re.search(r'2\.305|wts|STRING|맵 문구|w3a|A[0-9A-Z]{3}', before):
                continue
            if re.search(r'[A-Za-z]{4,}', q) and not re.search(r'[가-힣]', q):
                continue  # English/code fragments, not tooltip quotes
            pieces = [p for p in re.split(r'…|\.\.\.|▶', q) if len(norm(p)) >= 4]
            if not pieces:
                continue
            total += 1
            if not all(norm(p) in text for p in pieces):
                bad += 1
                problems.append((h['code'], idx, q))
print(f'tooltip quotes checked: {total}, not found in current tooltip: {bad}')
for code, idx, q in problems[: (None if '--verbose' in sys.argv else 40)]:
    print(f'  {code} [{idx}] "{q[:110]}"')
