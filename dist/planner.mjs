// Combination planner (수정내역 34): from the units a player owns, how far a target unit is, how many 흔함 선택 위습
// are needed, which materials are missing, and which upper units the hand can reach. Pure functions; recipe data is
// passed in (the overlay reads it from the player's own ORD_JHelper Data folder, it is not shipped in this repo).
//
// Recipe input: map-recipes-*.json from ORD_JHelper (recipes[].outputs/conditions). Condition kinds: UNIT = consumed
// material, UPUN = units this one upgrades into (not a material), WOOD/GOLD = lumber/gold cost; any other kind
// (RDUN random unit, IFCT 이세계 count, KING, SPEC, PICK, GREN, ...) is kept as a special requirement.
// Unit ids are map rawcodes in normal byte order (h02Z); tmo/helper hand data uses the reversed form (Z20h).

export const reverseRawcode=c=>typeof c==='string'?c.split('').reverse().join(''):c;

// recipes: map-recipes JSON. Returns Map(outputId -> [{id, materials:[{id,count}], wood, gold, special:[{kind,id,count}]}]).
export function indexRecipes(recipeJson){
  const byOutput=new Map();
  for(const r of recipeJson?.recipes??[]){
    const materials=[],special=[];let wood=0,gold=0;
    for(const c of r.conditions??[]){
      if(c.kind==='UNIT')materials.push({id:c.id,count:c.count??1});
      else if(c.kind==='WOOD')wood+=c.count??0;
      else if(c.kind==='GOLD')gold+=c.count??0;
      else if(c.kind!=='UPUN')special.push({kind:c.kind,id:c.id,count:c.count??1});
    }
    for(const o of r.outputs??[])if(o.kind==='UNIT'){
      if(!byOutput.has(o.id))byOutput.set(o.id,[]);
      byOutput.get(o.id).push({id:r.recipeId,materials,wood,gold,special});
    }
  }
  return byOutput;
}

// tier(id): grade text for a unit id ('흔함', '안흔함', ...). A leaf with tier 흔함 is bought with one 흔함 선택 위습.
const isCommon=t=>typeof t==='string'&&t.startsWith('흔함');

// Plan one target from a hand. owned: Map/obj id -> count (normal-order rawcodes). Uses owned units first at every
// level (an owned 전설 is not broken down again), then expands the cheapest recipe (fewest wisps). Returns
// {ok, wisps, commons:{id:count}, missing:{id:count} (non-common leaves with no recipe), wood, gold, special:[...],
//  used:{id:count} (owned units consumed), steps:[{output, recipe}] in craft order}.
export function planTarget(target,owned,recipes,tier,{maxDepth=8}={}){
  const stock=new Map(owned instanceof Map?owned:Object.entries(owned??{}));
  const best=expand(target,stock,recipes,tier,0,maxDepth,new Set());
  return {...best,ok:best.wisps===0&&!Object.keys(best.missing).length&&!best.special.length};
}

function emptyPlan(){return {wisps:0,commons:{},missing:{},wood:0,gold:0,special:[],used:{},steps:[]};}
function add(map,id,n){map[id]=(map[id]??0)+n;}
function merge(a,b){
  a.wisps+=b.wisps;a.wood+=b.wood;a.gold+=b.gold;a.special.push(...b.special);a.steps.push(...b.steps);
  for(const k of ['commons','missing','used'])for(const [id,n] of Object.entries(b[k]))add(a[k],id,n);
  return a;
}
// Cost order: fewer wisps, then fewer missing non-common leaves, then less wood.
const cost=p=>p.wisps+1000*Object.values(p.missing).reduce((x,n)=>x+n,0)+100*p.special.length+p.wood*.01;

function expand(id,stock,recipes,tier,depth,maxDepth,path){
  const have=stock.get(id)??0;
  if(have>0){stock.set(id,have-1);const p=emptyPlan();add(p.used,id,1);return p;}
  const options=recipes.get(id)??[];
  if(!options.length||depth>=maxDepth||path.has(id)){
    const p=emptyPlan();
    if(isCommon(tier(id))){p.wisps=1;add(p.commons,id,1);}else add(p.missing,id,1);
    return p;
  }
  let best=null,bestStock=null;
  for(const r of options){
    const trial=new Map(stock),p=emptyPlan();
    const next=new Set(path).add(id);
    for(const m of r.materials)for(let k=0;k<m.count;k++)merge(p,expand(m.id,trial,recipes,tier,depth+1,maxDepth,next));
    p.wood+=r.wood;p.gold+=r.gold;p.special.push(...r.special.map(s=>({...s,for:id})));
    p.steps.push({output:id,recipe:r.id});
    if(!best||cost(p)<cost(best)){best=p;bestStock=trial;}
  }
  for(const [k,v] of bestStock)stock.set(k,v);
  return best;
}

// Every craftable output ranked by how close the hand is: [{id, plan}] sorted by wisps, missing leaves, wood.
// filter(id) limits the outputs (e.g. only upper grades).
export function reachable(owned,recipes,tier,filter=()=>true){
  const out=[],have=owned instanceof Map?owned:new Map(Object.entries(owned??{}));
  for(const id of recipes.keys()){
    if(!filter(id)||(have.get(id)??0)>0)continue;   // already owned: not a next target
    out.push({id,plan:planTarget(id,owned,recipes,tier)});
  }
  return out.sort((a,b)=>cost(a.plan)-cost(b.plan));
}

// Hand normalisation from helper-style unit lists: [{Rawcode|rawcode|c, Count|count|k, Owner|owner}] (reversed
// rawcodes) -> {normalId: count} for the given owner (default 0 = the local player).
export function handFromUnits(units,owner=0){
  const hand={};
  for(const u of units??[]){
    const o=u.Owner??u.owner??0;if(o!==owner)continue;
    const raw=u.Rawcode??u.rawcode??u.c;if(typeof raw!=='string')continue;
    add(hand,reverseRawcode(raw),u.Count??u.count??u.k??1);
  }
  return hand;
}
