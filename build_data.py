"""Export the audited Python model inputs to the static simulator."""
import json
from pathlib import Path

root=Path(__file__).resolve().parent
work=root.parent/'work'
heroes=json.loads((work/'hero_classification.json').read_text(encoding='utf-8'))
forms=json.loads((work/'hero_forms_base.json').read_text(encoding='utf-8'))
units={x['id']:x['fields'] for x in json.loads((work/'hero_candidates2305.json').read_text(encoding='utf-8'))}
events=json.loads((work/'physical_cut_events.json').read_text(encoding='utf-8'))
out=[]
for h in heroes:
    if h['code']=='I8' or h['focus'] not in ('물리 중심','물리·마법 혼합'):
        continue
    hf=[]
    for f in forms:
        if f['code']!=h['code']:continue
        raw=units[f['rawcode']]
        splash=0
        if raw.get('ua1w')=='msplash':
            splash=1 if raw.get('ua1f',0) else .5 if raw.get('ua1h',0) else .25 if raw.get('ua1q',0) else 0
        hf.append(dict(rawcode=f['rawcode'],attack=f['full_attack'],aps=f['full_aps_theory'],
                       attack_type=f['attack_type'],splash=splash,
                       splash_radius=raw.get('ua1f') or raw.get('ua1h') or raw.get('ua1q') or 0,
                       rounds={r:d['type_factor'] for r,d in f['rounds'].items() if r in ('60','61','62','63','64','65')}))
    out.append(dict(code=h['code'],name=h['name'],grade=h['grade'],focus=h['focus'],
                    forms=hf,events=[e for e in events if e['code']==h['code']],
                    url=h['source_url']))
data=dict(version='2.305 원시 공격 + 2.323 ORDR 툴팁',heroes=out,
          rounds={"60":[112921500,170,"normal"],"61":[123189783,176,"large"],
                  "62":[128068400,181,"fort"],"63":[141582700,184,"large"],
                  "64":[150652700,180,"hero"],"65":[147024700,181,"hero"]},
          frenzy={"61":123189783,"62":128068400,"63":141582700,"64":150652700},
          boss={"60":[105187500,327],"65":[112158750,350]})
dest=root/'dist'/'data.json'
dest.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(dest, len(out),sum(len(h['events']) for h in out),dest.stat().st_size)
