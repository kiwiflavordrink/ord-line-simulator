// Analysis worker: all numbers come from ../../dist (advisor -> planner + engine_v3). Messages:
//  {type:'data', data}                         simulator data.json
//  {type:'helper', recipes, catalog, samples}  parsed ORD_JHelper files (any may be null)
//  {type:'analyze', id, hand, difficulty, goal, growthCut}
// Replies {type:'quick', id, ...} at once and {type:'next', id, next} after the slower target search.
import {teamFromHand,controlSums,comboStats,similarClears,nextTargets,unitIndex,isUpperTier} from '../../dist/advisor.mjs';
import {indexRecipes,planTarget,reverseRawcode} from '../../dist/planner.mjs';

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
      const {hand,difficulty='신',goal,growthCut=0}=m;
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
        const next=nextTargets(data,hand,recipes,tier,{limit:6,difficulty,red,growthCut});
        postMessage({type:'next',id:m.id,next});
      },0);
    }
  }catch(err){postMessage({type:'error',id:m.id,message:String(err?.message??err)});}
};
