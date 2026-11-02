"""Rewrite dist/data.json with one hero field / one event per line so that
calculation fixes show up as readable diffs. Values are not changed."""
import json, sys
from pathlib import Path

path = Path(__file__).resolve().parent.parent / 'dist' / 'data.json'
data = json.loads(path.read_text(encoding='utf-8'))
dump = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))

lines = ['{']
keys = list(data)
for ki, key in enumerate(keys):
    tail = ',' if ki < len(keys) - 1 else ''
    if key != 'heroes':
        lines.append(f' {dump(key)}:{dump(data[key])}{tail}')
        continue
    lines.append(' "heroes":[')
    for hi, hero in enumerate(data['heroes']):
        lines.append('  {')
        hkeys = list(hero)
        for fi, field in enumerate(hkeys):
            ftail = ',' if fi < len(hkeys) - 1 else ''
            value = hero[field]
            if field in ('forms', 'events'):
                lines.append(f'   {dump(field)}:[')
                for ei, item in enumerate(value):
                    lines.append(f'    {dump(item)}' + (',' if ei < len(value) - 1 else ''))
                lines.append(f'   ]{ftail}')
            else:
                lines.append(f'   {dump(field)}:{dump(value)}{ftail}')
        lines.append('  }' + (',' if hi < len(data['heroes']) - 1 else ''))
    lines.append(f' ]{tail}')
lines.append('}')
text = '\n'.join(lines) + '\n'
assert json.loads(text) == data
path.write_text(text, encoding='utf-8')
print(f'{path}: {len(lines)} lines')
