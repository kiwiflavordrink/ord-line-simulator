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
// prices (수정내역 83, optional): from priceModel() — every unit costs the 흔함 it takes; leaves that 위습 cannot give
// (특수 기물) and special conditions get the user's 흔함-equivalent prices, and locked leaves (한 판에 한 번) cost
// Infinity. plan.price = 흔함 count + those prices (0 for owned materials).
export function planTarget(target,owned,recipes,tier,{maxDepth=8,prices=null}={}){
  const stock=new Map(owned instanceof Map?owned:Object.entries(owned??{}));
  const best=expand(target,stock,recipes,tier,0,maxDepth,new Set(),prices);
  return {...best,ok:best.wisps===0&&!Object.keys(best.missing).length&&!best.special.some(s=>!prices||(prices.special(s)??0)>0)};
}

function emptyPlan(){return {wisps:0,price:0,commons:{},missing:{},wood:0,gold:0,special:[],used:{},steps:[]};}
function add(map,id,n){map[id]=(map[id]??0)+n;}
function merge(a,b){
  a.wisps+=b.wisps;a.price+=b.price;a.wood+=b.wood;a.gold+=b.gold;a.special.push(...b.special);a.steps.push(...b.steps);
  for(const k of ['commons','missing','used'])for(const [id,n] of Object.entries(b[k]))add(a[k],id,n);
  return a;
}
// Cost order: fewer wisps, then fewer missing non-common leaves, then less wood.
// With prices: the 흔함-equivalent price (then wood).
const cost=p=>p.priced?p.price+p.wood*.01:p.wisps+1000*Object.values(p.missing).reduce((x,n)=>x+n,0)+100*p.special.length+p.wood*.01;

function expand(id,stock,recipes,tier,depth,maxDepth,path,prices){
  const have=stock.get(id)??0;
  if(have>0){stock.set(id,have-1);const p=emptyPlan();add(p.used,id,1);return p;}
  // A recipe with nothing to consume (helper data lists 해적선·레일리(희귀) this way) is not a free craft: the unit comes
  // from a special source, so it is a leaf like a unit without a recipe (수정내역 79).
  const options=(recipes.get(id)??[]).filter(r=>r.materials.length||r.special.length||r.wood||r.gold);
  if(!options.length||depth>=maxDepth||path.has(id)){
    const p=emptyPlan();p.priced=!!prices;
    if(isCommon(tier(id))){p.wisps=1;p.price=1;add(p.commons,id,1);}
    else{add(p.missing,id,1);if(prices)p.price=prices.leaf(id);}
    return p;
  }
  let best=null,bestStock=null;
  for(const r of options){
    const trial=new Map(stock),p=emptyPlan();p.priced=!!prices;
    const next=new Set(path).add(id);
    for(const m of r.materials)for(let k=0;k<m.count;k++)merge(p,expand(m.id,trial,recipes,tier,depth+1,maxDepth,next,prices));
    p.wood+=r.wood;p.gold+=r.gold;p.special.push(...r.special.map(s=>({...s,for:id})));
    if(prices)for(const s of r.special)p.price+=prices.special(s)??0;
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

// Craft order by stage (수정내역 79): the plan's crafts grouped by the output's grade, lowest first (안흔함 → 희귀 →
// 특별 → 전설 …), each with how many to make and one recipe's materials. Also the commons to pick with 선택 위습 and
// the special pieces (해적선·레일리(희귀)·토큰·초월쿠마 …: non-common leaves that 위습 cannot give).
const STAGE=['흔함','안흔함','특별','희귀','전설','히든','특수','해적선','제한','초월','영원','불멸','신비','변화','왜곡','세라핌','랜덤'];
export const stageOf=t=>{const s=String(t??'');const i=STAGE.findIndex(x=>s.startsWith(x)||s.includes(x));return i<0?STAGE.length:i;};
export function craftStages(plan,recipes,tier){
  const count=new Map(),recipeOf=new Map();
  for(const st of plan.steps){count.set(st.output,(count.get(st.output)??0)+1);if(!recipeOf.has(st.output))recipeOf.set(st.output,st.recipe);}
  const stages=new Map();
  for(const [id,n] of count){
    const t=tier(id)??'',k=stageOf(t),name=String(t).replace(/\s*\[.*\]/,'')||'기타';
    if(!stages.has(k))stages.set(k,{rank:k,tier:name,items:[]});
    const r=(recipes.get(id)??[]).find(x=>x.id===recipeOf.get(id));
    stages.get(k).items.push({id,count:n,materials:r?r.materials:[],wood:r?.wood??0,gold:r?.gold??0});
  }
  return {commons:plan.commons,specials:plan.missing,used:plan.used,
    stages:[...stages.values()].sort((a,b)=>a.rank-b.rank)};
}

// Price model (수정내역 83, 유저 규칙): every unit costs the 흔함 it takes (흔함 = 1, recipes summed). Pieces that 위습
// cannot give and special recipe conditions use the user's 흔함-equivalents, with L = mean 흔함 of a 전설 recipe:
//   다세유닛(랜덤유닛)·초월위습(초월쿠마)·토큰·조합용 유니크 아이템(ITEM)·다세 선택(PICK) = L,
//   레일리(희귀)·고대의 배 = 0.33 L, 해적선 = 5, 좀비 = 1 (압살롬 = 좀비 3 + 나미 = 흔함 4),
//   변이(CHCT) = 레베카 히든의 흔함 수, 그린블러드(GREN) = 희귀 평균(R, 한 판에 1개). 다른 기타 기물 = L.
//   세라핌(전설 + 그린블러드)은 그래서 왜곡급(약 1.3~1.5 L)이 된다. 조건만 있는 것(KING·UBAN·SKPT·RMAX) = 0,
//   의미를 모르는 것(IFCT·SPEC) = null(가격 없음, 조건으로만 표시).
// 한 판에 한 번(초월위습, 같은 유니크 아이템): locked ids cost Infinity (lockedPieces() finds them from the hand).
export const PIECE_RULES=[
  {match:/^해적선$/,price:()=>5,label:'해적선'},
  {match:/^고대의 배$/,price:L=>.33*L,label:'고대의 배'},
  {match:/^레일리\(희귀\)$/,price:L=>.33*L,label:'레일리(희귀)'},
  {match:/^초월쿠마$/,price:L=>L,label:'초월 위습',once:true},
  {match:/^토큰$/,price:L=>L,label:'토큰'},
  {match:/^좀비$/,price:()=>1,label:'좀비'},
];
export function priceModel(recipes,tier,name,{locked=new Set()}={}){
  const base=id=>planTarget(id,{},recipes,tier).wisps;
  const outs=[...recipes.keys()];
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const L=mean(outs.filter(id=>/^전설/.test(tier(id)??'')).map(base));
  const rebeccaHidden=outs.find(id=>name(id)==='레베카'&&/^히든/.test(tier(id)??''));
  const R=mean(outs.filter(id=>/^희귀/.test(tier(id)??'')).map(base));
  const mutation=rebeccaHidden?base(rebeccaHidden):2*R;
  const leaf=id=>{
    if(locked.has(id))return Infinity;
    const n=name(id)??'',t=tier(id)??'';
    const r=PIECE_RULES.find(x=>x.match.test(n));
    if(r)return r.price(L);
    return L;   // 다세유닛(랜덤유닛)·기타 기물·레시피 없는 상위 재료
  };
  const special=s=>{
    if(s.kind==='ITEM')return locked.has('ITEM:'+s.id)?Infinity:L;
    if(s.kind==='PICK')return L;
    if(s.kind==='CHCT')return mutation;
    if(s.kind==='GREN')return locked.has('GREN:'+s.id)?Infinity:R;   // 그린블러드: 희귀급, 한 판에 1개
    if(['KING','UBAN','SKPT','RMAX'].includes(s.kind))return 0;
    return null;
  };
  return {L,R,mutation,leaf,special,locked};
}
// 한 판에 한 번 쓰는 기물: the hand already holds a unit made with it (초월 → 초월위습, 우타 영원 → its 유니크 아이템,
// 세라핌 → 그린블러드)
// and not the piece itself → other targets needing it are locked.
export function lockedPieces(owned,recipes,name){
  const have=owned instanceof Map?owned:new Map(Object.entries(owned??{}));
  const once=new Set();
  for(const [id,rs] of recipes)for(const r of rs)for(const m of r.materials)if(PIECE_RULES.find(x=>x.once&&x.match.test(name(m.id)??'')))once.add(m.id);
  const locked=new Set();
  for(const [id,n] of have){
    if(!(n>0))continue;
    for(const r of recipes.get(id)??[]){
      for(const m of r.materials)if(once.has(m.id)&&!(have.get(m.id)>0))locked.add(m.id);
      for(const s of r.special)if(s.kind==='ITEM'||s.kind==='GREN')locked.add(s.kind+':'+s.id);
    }
  }
  return locked;
}
// Share of a target already covered by the hand: 1 - price(hand)/price(empty hand).
export function fulfillment(target,owned,recipes,tier,prices){
  const full=planTarget(target,{},recipes,tier,{prices}).price,now=planTarget(target,owned,recipes,tier,{prices});
  return {pct:full>0&&Number.isFinite(now.price)?Math.max(0,Math.min(1,1-now.price/full)):0,full,remaining:now.price,plan:now};
}
