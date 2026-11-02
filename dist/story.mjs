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
  // 슈가 전설 (engine deleter L19, 수정내역 39): 장난감화 cannot target a story; the player uses it on the line and
  // brings the toy. On a story: L19S = 슈가 itself (w3u h037 ua1b 21000 + 1d3, cd 0.73, normal, R000; 하비하비열매
  // "공격시 10% 확률로 500범위 50만 물리" self-destruct toy h06P), L19T = 장난감 No.31 (w3u h06N ua1b 185000, cd 0.39,
  // siege, R000). No.31 presence: 장난감화 30 s per 85 s cooldown + "공격시 0.8% 확률로 4.5초" = 30/85 + 1.37x0.008x4.5.
  const R000={first:7250,per_level:725,max_level:21},L=level('전설');
  const normal={60:1.25,61:1,62:.75,63:1,64:1,65:1},siege={60:1,61:.75,62:1.25,63:.75,64:.8,65:.8};
  if(!d.heroes.some(h=>h.code==='L19S'))d.heroes.push(
    {code:'L19S',name:'슈가 전설(스토리)',grade:'전설',forms:[{rawcode:'h037',attack:21002+upgradeBonus(R000,L),aps:1/.73,attack_type:'normal',
      splash:0,splash_radius:0,rounds:normal,cooldown:.73,range:650}],
      events:[{code:'L19S',index:'하비하비열매',rate:.1/.73,per_attack:true,parts:[['physical',500000,[],0]],radius:500,center:'target'}]},
    {code:'L19T',name:'장난감 No.31',grade:'전설',attack_uptime:30/85+(1/.73)*.008*4.5,forms:[{rawcode:'h06N',attack:185000+upgradeBonus(R000,L),
      aps:1/.39,attack_type:'siege',splash:0,splash_radius:0,rounds:siege,cooldown:.39,range:460}],events:[]});
  return d;
}

// Engine-built supports with an attack upgrade (2.305 R000, 21 levels): their attack is stored at full upgrade.
const SUPPORT_UPGRADE={L7:{first:7250,per_level:725,max_level:21}};

// Seconds to kill story `stage` (1~14) with `team` (codes, or {code,count}); Infinity if not within opts.seconds.
// opts: difficulty, players, level(grade) upgrade level, plus any simulateV2 option (traits, z2Level, red, …).
export function storyKillTime(data,team,stage,{difficulty='신',players=1,level=null,seconds=600,...opts}={}){
  const s=data.stories.stages[stage-1];
  if(!s)throw new Error(`스토리 ${stage}단계가 없습니다.`);
  const d=dataAtUpgrade(data,level??(()=>99));
  const saved={};
  if(level)for(const [code,u] of Object.entries(SUPPORT_UPGRADE)){
    saved[code]=SUPPORTS[code].attack;
    SUPPORTS[code].attack-=upgradeBonus(u,u.max_level)-upgradeBonus(u,level(SUPPORTS[code].grade??'전설'));
  }
  try{
    // 슈가 전설 on a story = itself + the No.31 toy it brings (above).
    const units=team.flatMap(t=>{const x=typeof t==='string'?{code:t}:t;return x.code==='L19'||x.code==='L19S'?[{...x,code:'L19S'},{...x,code:'L19T'}]:[x];});
    const r=simulateV2(d,units,{difficulty,red:false,redDamage:false,cut:0,heroArmorCuts:true,...opts,
      story:{hp:s.hp*storyHpMultiplier(data,difficulty,players,stage),armor:s.armor,regen:s.regen,seconds}});
    return r.story.killed?r.story.second:Infinity;
  }finally{for(const [code,a] of Object.entries(saved))SUPPORTS[code].attack=a;}
}

// 수정내역 96: damage per second on a story stage (no regen) — for ranking units on 에그헤드 (stage 14).
// A unit alone gets only its own armor cut (유저: "방깎은 자체 방깎만"). opts.gorosei measures each 오로성.
// Real stage HP (players) so percent-of-HP skills stay realistic; killed early → HP / kill time.
export function storyDps(data,team,stage,{difficulty='신',players=1,seconds=240,...opts}={}){
  const s=data.stories.stages[stage-1];if(!s)throw new Error(`스토리 ${stage}단계가 없습니다.`);
  const HP=s.hp*storyHpMultiplier(data,difficulty,players,stage),d=dataAtUpgrade(data,()=>99);
  const units=team.flatMap(t=>{const x=typeof t==='string'?{code:t}:t;return x.code==='L19'||x.code==='L19S'?[{...x,code:'L19S'},{...x,code:'L19T'}]:[x];});
  const r=simulateV2(d,units,{difficulty,red:false,redDamage:false,cut:0,heroArmorCuts:true,...opts,story:{hp:HP,armor:s.armor,regen:0,seconds}});
  return r.story.killed?HP/r.story.second:(HP-r.story.hpLeft)/seconds;
}

// 수정내역 96: seconds to kill the 30·40·50라 boss (data.mid_bosses, 2.305) within its 60 s limit; Infinity if not.
// Large armor (typeRound 61), boss-only skill parts and the engine's boss regen apply. 오로성 워큐리 adds boss HP.
export function midBossKillTime(data,team,round,{difficulty='신',gorosei=null,seconds=60,...opts}={}){
  const b=data.mid_bosses?.[String(round)];if(!b)throw new Error(`${round}라 보스 자료가 없습니다.`);
  const mb=data.mid_bosses,diff=data.difficulties?.[difficulty];
  const curse=gorosei&&data.gorosei?.[gorosei]?.[difficulty]?data.gorosei[gorosei][difficulty]:{};
  const hp=b.uhpm*(mb.hp_multiplier[difficulty]??mb.hp_multiplier['신'])+(diff?.common?.hp??0)+(curse.boss_hp??0);
  const armor=b.udef+b.udup*(mb.armor_level[difficulty]??1)+mb.armor_flat;
  const d=dataAtUpgrade(data,()=>99);
  const units=team.map(t=>typeof t==='string'?{code:t}:t);
  if(!units.length)return Infinity;
  const r=simulateV2(d,units,{difficulty,red:false,redDamage:false,cut:0,heroArmorCuts:true,gorosei,...opts,
    story:{hp,armor,regen:0,seconds,kind:'boss',typeRound:'61'}});
  return r.story.killed?r.story.second:Infinity;
}
