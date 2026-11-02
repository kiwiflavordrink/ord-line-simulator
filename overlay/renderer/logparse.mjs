// Tolerant reader for ORD_JHelper output (수정내역 34). The helper's recommendation log format is not documented here,
// so this looks, from the newest line back, for the first JSON value that holds a unit list
// [{Rawcode|rawcode, Count|count, Owner|owner}] and picks up nearby game fields (Difficulty, Round, GoalUnitId, Gold,
// Lumber) from the same object, its parents or their plain-object children. Simulation scenario files (Frames[]) use the same field names.
const UNIT_KEYS=['Rawcode','rawcode','RawCode'];
const isUnit=o=>o&&typeof o==='object'&&UNIT_KEYS.some(k=>typeof o[k]==='string');
const FIELDS={difficulty:['Difficulty','difficulty'],round:['Round','round'],goal:['GoalUnitId','goalUnitId','Goal','goal'],
  gold:['Gold','gold'],lumber:['Lumber','lumber','Wood','wood'],seconds:['Seconds','seconds'],state:['State','state']};

// Nearest scalar field: each ancestor (innermost first), then that ancestor's plain-object children ({state:{Round}}).
function pick(chain,keys){
  const own=o=>{for(const k of keys)if(o[k]!=null&&typeof o[k]!=='object')return o[k];return null;};
  for(let i=chain.length-1;i>=0;i--){
    let v=own(chain[i]);if(v!=null)return v;
    for(const c of Object.values(chain[i]))if(c&&typeof c==='object'&&!Array.isArray(c)&&(v=own(c))!=null)return v;
  }
  return null;
}

// Depth-first search for the first array of unit objects; returns {units, chain:[ancestor objects]}.
function findUnits(v,chain=[],depth=0){
  if(depth>8||!v||typeof v!=='object')return null;
  if(Array.isArray(v)){
    if(v.length&&v.every(isUnit))return {units:v,chain};
    for(let i=v.length-1;i>=0;i--){const r=findUnits(v[i],chain,depth+1);if(r)return r;}   // newest entry last
    return null;
  }
  const next=[...chain,v];
  for(const k of ['Units','units','Hand','hand','OwnedUnits','ownedUnits'])if(Array.isArray(v[k])&&(!v[k].length||v[k].every(isUnit)))return {units:v[k],chain:next};
  for(const x of Object.values(v)){const r=findUnits(x,next,depth+1);if(r)return r;}
  return null;
}

// goal 'rawcode:A90H' (reversed) -> 'H09A'
export const goalId=g=>typeof g==='string'&&g.startsWith('rawcode:')?g.slice(8).split('').reverse().join(''):null;

export function snapshotFromValue(v){
  const r=findUnits(v);if(!r)return null;
  const out={units:r.units};
  for(const [f,keys] of Object.entries(FIELDS))out[f]=pick(r.chain,keys);
  out.goal=goalId(out.goal);
  return out;
}

// text: whole JSON file or JSON-lines tail. Returns the newest snapshot or null.
export function parseHelperText(text){
  const t=text.trim();if(!t)return null;
  try{return snapshotFromValue(JSON.parse(t));}catch{}
  const lines=t.split(/\r?\n/);
  for(let i=lines.length-1;i>=0;i--){
    const l=lines[i].trim();if(!l.startsWith('{')&&!l.startsWith('['))continue;
    try{const s=snapshotFromValue(JSON.parse(l));if(s)return s;}catch{}
  }
  return null;
}
