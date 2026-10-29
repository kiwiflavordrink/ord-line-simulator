// Analysis worker: all numbers come from ../../dist (advisor -> planner + engine_v3). Messages:
//  {type:'data', data}                         simulator data.json
//  {type:'helper', recipes, catalog, samples}  parsed ORD_JHelper files (any may be null)
//  {type:'analyze', id, hand, difficulty, goal, growthCut}
// Replies {type:'quick', id, ...} at once and {type:'next', id, next} after the slower target search.
import {teamFromHand,controlSums,comboStats,similarClears,nextTargets,unitIndex,isUpperTier,guideTargets,buildKeyIndex,pairIndex} from '../../dist/advisor.mjs';
import {indexRecipes,planTarget,reverseRawcode,reachable,craftStages} from '../../dist/planner.mjs';
import {coachWarnings,questHints,coachActive,questStatus} from '../../dist/coach.mjs';

let data=null,index=null,recipes=new Map(),tiers=new Map(),names=new Map(),samples=[],latest=0,keyIndex=null,pairs=null;
const tier=id=>tiers.get(id);

onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='data'){data=m.data;index=unitIndex(data);return;}
    if(m.type==='helper'){
      recipes=m.recipes?indexRecipes(m.recipes):new Map();
      tiers=new Map((m.catalog?.units??[]).map(u=>[reverseRawcode(u.rawcode),u.tier]));
      samples=m.samples?.samples??m.samples??[];
      // 수정내역 83: guide indexes (겹침패 key materials, real-clear pairs), built once per helper load.
      names=new Map((m.catalog?.units??[]).map(u=>[reverseRawcode(u.rawcode),u.name]));
      keyIndex=recipes.size?buildKeyIndex(recipes,tier):null;
      pairs=samples.length?pairIndex(samples,r=>isUpperTier(tier(r))):null;
      postMessage({type:'helper-ok',recipes:recipes.size,units:tiers.size,samples:samples.length});return;
    }
    // 수정내역 79: simulation-only requests (one difficulty), so several workers can run the difficulties in parallel.
    // 수정내역 85: coach warnings (story kill times run here; stats come from the page's simulation workers).
    if(m.type==='coach'){
      const c={...m.ctx};
      // 수정내역 90: other players' units from the memory reader join the team (story, map-wide effects).
      if(c.othersHand&&Object.keys(c.othersHand).length){const ot=teamFromHand(data,c.othersHand,index).team;c.team=[...(c.myTeam??[]),...ot];}
      const w=[...coachWarnings(data,{...c,limit:99}),
        ...questHints(data,{...c,team:c.team??c.myTeam,recipes,tier,name:id=>names.get(id)})];   // 수정내역 86
      postMessage({type:'coach',id:m.id,warnings:w.sort((a,b)=>b.priority-a.priority).slice(0,3),active:coachActive(c),
        quests:questStatus({quests:c.quests,hand:c.hand??{},recipes,tier,progress:c.questProgress??{}})});
      return;
    }
    if(m.type==='sim'){
      postMessage({type:'stat',id:m.id,key:m.key,difficulty:m.difficulty,stat:comboStats(data,m.team,{red:m.red,growthCut:m.growthCut,difficulties:[m.difficulty]})[m.difficulty]});
      return;
    }
    if(m.type==='analyze'){
      latest=m.id;
      const {hand,difficulty='신',goal,growthCut=0}=m;   // m.cats: target categories (수정내역 49)
      const {team,red,unknown,raws}=teamFromHand(data,hand,index);
      // 수정내역 79: everything that comes from the hand alone is sent first (no simulation); the page then asks the
      // simulation workers for each difficulty (selected first) and fills the numbers in when they arrive.
      const ctrl=controlSums(data,team,red);
      const upper=tiers.size?r=>isUpperTier(tier(r)):r=>index.has(r);
      const similar=samples.length?similarClears(samples,hand,{difficulty,isUpper:upper}):null;
      const goalPlan=goal&&recipes.size?(()=>{const plan=planTarget(goal,hand,recipes,tier);return {id:goal,plan,stages:craftStages(plan,recipes,tier)};})():null;
      postMessage({type:'quick',id:m.id,team,raws,red,unknown,stats:{},ctrl,similar,goalPlan});
      if(m.simInline){const diffs=[...new Set([difficulty,'신','악몽','지옥'])];
        postMessage({type:'stats',id:m.id,stats:comboStats(data,team,{red,growthCut,difficulties:diffs})});}
      // The search is slower (one simulation per candidate); skip it if a newer hand already arrived.
      setTimeout(()=>{
        if(m.id!==latest||!recipes.size)return;
        // 수정내역 48: what can be crafted right now (no wisps, nothing missing), and the nearest 희귀·상위 targets with the
        // commons to pick with 선택 위습.
        const craftTier=t=>t&&!/^(흔함|안흔함|아이템|자원|기타)$/.test(t);
        const now=reachable(hand,recipes,tier,id=>craftTier(tier(id))).filter(x=>x.plan.ok).slice(0,12);
        // 수정내역 49: target categories chosen by the user (helper-style): 희귀, 전설, 히든, 상위(초월·불멸·영원·제한),
        // 신비·변화·왜곡·세라핌, 해적선, 보조([스턴] 표기 유닛).
        const CAT={rare:/희귀/,legend:/^전설/,hidden:/^히든/,upper:/초월|불멸|영원|제한/,mystic:/신비|변화|왜곡|세라핌/,ship:/해적선/,support:/\[스턴\]/};
        const cats=(m.cats?.length?m.cats:['legend','upper']).filter(c=>CAT[c]);
        // One list per chosen category (5 each), so cheap 희귀 do not push 해적선 or 상위 off the list.
        const LABEL={rare:'희귀',legend:'전설',hidden:'히든',upper:'상위(초불영제)',mystic:'신비·기타',ship:'해적선',support:'보조'};
        // 수정내역 66: only the list the open tab shows is searched (each candidate costs one simulation).
        const view=m.view??'now';
        const next=view==='next'?cats.map(c=>({cat:c,label:LABEL[c],list:nextTargets(data,hand,recipes,tier,{limit:5,difficulty,red,growthCut,simulate:false,
          isTarget:id=>CAT[c].test(tier(id)??'')})})):null;
        // 추천 상위: the nearest 초월·불멸·영원·제한·신비 targets, ranked by the simulation after crafting (clear first, fewer left).
        let upper=null,guide=null;
        if(view==='upper'){
          // 수정내역 83: 가이드 — nearest targets by 흔함 price with fit, gaps and 겹침패 (replaces the 추천 상위 simulation list).
          const o={samplesIndex:pairs,keyIndex,difficulty,gorosei:m.gorosei??null,red};
          const nm=id=>names.get(id);
          const up=guideTargets(data,hand,recipes,tier,nm,{...o,grades:'upper',limit:8});
          const lg=guideTargets(data,hand,recipes,tier,nm,{...o,grades:'legend',limit:6});
          guide={L:up.L,locked:up.locked,groups:[{label:'가까운 상위',list:up.list},{label:'가까운 전설·히든·해적선',list:lg.list}]};
        }
        const withStages=x=>({...x,stages:craftStages(x.plan,recipes,tier)});
        if(guide)for(const g of guide.groups)g.list=g.list.map(x=>x.locked?x:withStages(x));
        postMessage({type:'next',id:m.id,next:next?.map(g=>({...g,list:g.list.map(withStages)})),upper:null,guide,now});
      },0);
    }
  }catch(err){postMessage({type:'error',id:m.id,message:String(err?.message??err)});}
};
