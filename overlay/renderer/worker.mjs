// Analysis worker: all numbers come from ../../dist (advisor -> planner + engine_v3). Messages:
//  {type:'data', data}                         simulator data.json
//  {type:'helper', recipes, catalog, samples}  parsed ORD_JHelper files (any may be null)
//  {type:'analyze', id, hand, difficulty, goal, growthCut}
// Replies {type:'quick', id, ...} at once and {type:'next', id, next} after the slower target search.
import {teamFromHand,controlSums,comboStats,similarClears,nextTargets,unitIndex,isUpperTier} from '../../dist/advisor.mjs';
import {indexRecipes,planTarget,reverseRawcode,reachable} from '../../dist/planner.mjs';

let data=null,index=null,recipes=new Map(),tiers=new Map(),samples=[],latest=0;
const tier=id=>tiers.get(id);

onmessage=e=>{
  const m=e.data;
  try{
    if(m.type==='data'){data=m.data;index=unitIndex(data);return;}
    if(m.type==='helper'){
      recipes=m.recipes?indexRecipes(m.recipes):new Map();
      tiers=new Map((m.catalog?.units??[]).map(u=>[reverseRawcode(u.rawcode),u.tier]));
      samples=m.samples?.samples??m.samples??[];
      postMessage({type:'helper-ok',recipes:recipes.size,units:tiers.size,samples:samples.length});return;
    }
    if(m.type==='analyze'){
      latest=m.id;
      const {hand,difficulty='신',goal,growthCut=0}=m;   // m.cats: target categories (수정내역 49)
      const {team,red,unknown,raws}=teamFromHand(data,hand,index);
      const diffs=[...new Set([difficulty,'신','악몽','지옥'])];
      const stats=comboStats(data,team,{red,growthCut,difficulties:diffs});
      const ctrl=controlSums(data,team,red);
      const upper=tiers.size?r=>isUpperTier(tier(r)):r=>index.has(r);
      const similar=samples.length?similarClears(samples,hand,{difficulty,isUpper:upper}):null;
      const goalPlan=goal&&recipes.size?{id:goal,plan:planTarget(goal,hand,recipes,tier)}:null;
      postMessage({type:'quick',id:m.id,team,raws,red,unknown,stats,ctrl,similar,goalPlan});
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
        const next=cats.map(c=>({cat:c,label:LABEL[c],list:nextTargets(data,hand,recipes,tier,{limit:5,difficulty,red,growthCut,
          isTarget:id=>CAT[c].test(tier(id)??'')})}));
        const rare=[];
        postMessage({type:'next',id:m.id,next,rare,now});
      },0);
    }
  }catch(err){postMessage({type:'error',id:m.id,message:String(err?.message??err)});}
};
