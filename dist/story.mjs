// Story (스토리) kill-time estimates (수정내역 38). A story unit stands still; the units sent there attack it until it
// dies. Uses simulateV2's story mode (one stationary fort-armor target, same armor/magic debuffs as line mobs, no
// percent-HP damage) with attack values lowered to a chosen upgrade level.
import {simulateV2} from './engine_v3.mjs';
import {SUPPORTS} from './engine.mjs';

// 2.305 Rugf attack upgrade: level L adds first + (L-1) x per_level (0 at L=0), capped at max_level.
export const upgradeBonus=(u,L)=>!u||L<=0?0:u.first+(Math.min(L,u.max_level)-1)*u.per_level;

// Story HP multiplier: 1 + difficulty base + per-player x players + player-count reduction (+ solo 13·14단계).
export function storyHpMultiplier(data,difficulty='신',players=1,stage=1){
  const u=data.stories.hp_upgrades,dif=u.difficulty[difficulty]??u.difficulty['신'];
  const p=Math.min(4,Math.max(1,Math.round(players)));
  let m=1+dif.base+dif.per_player*p+(u.players[String(p)]??0);
  if(p===1&&u.solo_late_stages.stages.includes(stage))m+=u.solo_late_stages.value;
  return m;
}

// Copy of data with every form's attack at the upgrade level given by level(grade, hero). data.json attack values
// are at the maximum level (2.305 w3u ua1b + dice + full upgrade).
export function dataAtUpgrade(data,level){
  const d=structuredClone(data);
  for(const h of d.heroes)for(const f of h.forms){
    const u=f.attack_upgrade;if(!u)continue;
    f.attack=Math.max(1,f.attack-upgradeBonus(u,u.max_level)+upgradeBonus(u,level(h.grade,h)));
  }
  // 슈가 전설 (engine deleter L19) cannot turn a story into a toy; on a story it only attacks: 2.305 w3u h037
  // ua1b 21000 + 1d3, cd 0.73, normal, R000 upgrade, plus 하비하비열매 "공격시 10% 확률로 500범위 50만 물리" (2.323).
  if(!d.heroes.some(h=>h.code==='L19S'))d.heroes.push({code:'L19S',name:'슈가 전설(스토리)',grade:'전설',
    forms:[{rawcode:'h037',attack:21002+upgradeBonus({first:7250,per_level:725,max_level:21},level('전설')),aps:1/.73,attack_type:'normal',
      splash:0,splash_radius:0,rounds:{60:1,61:1,62:1,63:1,64:1,65:1},cooldown:.73,range:650}],
    events:[{code:'L19S',index:'하비하비열매',rate:.1/.73,per_attack:true,parts:[['physical',500000,[],0]],radius:500,center:'target'}]});
  return d;
}

// Engine-built supports with an attack upgrade (2.305 R000, 21 levels): their attack is stored at full upgrade.
const SUPPORT_UPGRADE={L7:{first:7250,per_level:725,max_level:21}};

// Seconds to kill story `stage` (1~14) with `team` (codes, or {code,count}); Infinity if not within opts.seconds.
// opts: difficulty, players, level(grade) upgrade level, plus any simulateV2 option (traits, z2Level, red, …).
export function storyKillTime(data,team,stage,{difficulty='신',players=1,level=null,seconds=600,...opts}={}){
  const s=data.stories.stages[stage-1];
  if(!s)throw new Error(`스토리 ${stage}단계가 없습니다.`);
  const d=level?dataAtUpgrade(data,level):data;
  const saved={};
  if(level)for(const [code,u] of Object.entries(SUPPORT_UPGRADE)){
    saved[code]=SUPPORTS[code].attack;
    SUPPORTS[code].attack-=upgradeBonus(u,u.max_level)-upgradeBonus(u,level(SUPPORTS[code].grade??'전설'));
  }
  try{
    const r=simulateV2(d,team.map(t=>typeof t==='string'?{code:t}:t),{difficulty,red:false,redDamage:false,cut:0,heroArmorCuts:true,...opts,
      story:{hp:s.hp*storyHpMultiplier(data,difficulty,players,stage),armor:s.armor,regen:s.regen,seconds}});
    return r.story.killed?r.story.second:Infinity;
  }finally{for(const [code,a] of Object.entries(saved))SUPPORTS[code].attack=a;}
}
