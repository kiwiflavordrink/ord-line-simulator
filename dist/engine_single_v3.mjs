// One God 65 line mob, full-up 2.305 attack stats and 2.323 tooltip skills.
// All selected units attack the same target; no external buffs or debuffs.
export const SINGLE_MOB={hp:147_024_700,armor:181,magicResist:.05};
const TYPE={siege:.8,normal:1,pierce:.9,hero:1.05};
export const SINGLE_UNITS=[
  {code:'L9',name:'루치 전설',role:'단일',aps:7.5962,attack:28002,type:'siege',source:'https://ordr.kr/character/L9'},
  {code:'L16',name:'상디 전설',role:'단일',aps:8.7778,attack:29202,type:'siege',source:'https://ordr.kr/character/L16'},
  {code:'L31',name:'코비 전설',role:'단일',aps:6.9298,attack:42751,type:'normal',source:'https://ordr.kr/character/L31'},
  {code:'H13',name:'스튜시 히든',role:'단일',aps:6,attack:41227,type:'normal',source:'https://ordr.kr/character/H13'},
  {code:'H19',name:'캐럿 히든',role:'단일',aps:5.1429,attack:40226,type:'pierce',source:'https://ordr.kr/character/H19'},
  {code:'T1',name:'도플라밍고 변화',role:'단일',aps:(1+1.85+20*.05)/.61,attack:75001,type:'pierce',source:'https://ordr.kr/character/T1'},
  {code:'L6',name:'레이쥬 전설',role:'단일',aps:4.4886,attack:46751,type:'pierce',source:'https://ordr.kr/character/L6'},
  {code:'H5',name:'류마 히든',role:'단일',aps:5.3731,attack:27226,type:'pierce',source:'https://ordr.kr/character/H5'},
  {code:'D6',name:'바제스 왜곡',role:'조건부 단일',aps:3.3043,attack:302201,type:'siege',source:'https://ordr.kr/character/D6'},
  {code:'L36',name:'핸콕 전설',role:'끝딜',aps:(1+2.95)/.76,attack:48751,type:'hero',source:'https://ordr.kr/character/L36'}
];
const BY_CODE=new Map(SINGLE_UNITS.map(u=>[u.code,u]));
const hBuffAps=(1+2.95+.45)/.76;
function rng(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function hit(unit,hp,r,at,state,context){
  const MAGIC=context.magic*context.all;
  const PHYSICAL=(1/(1+.02*Math.max(0,context.armor)))*context.all;
  const EXPLOSIVE=context.explosive*context.all;
  const basic=unit.attack*TYPE[unit.type]*PHYSICAL;
  hp-=basic;
  switch(unit.code){
    case 'L9':
      if(r()<.12){hp-=(100000+345000*1.5)*MAGIC;hp*=1-.34*MAGIC;}
      if(r()<.15)hp-=250000*MAGIC;
      break;
    case 'L16':
      hp-=40000*1.15*MAGIC;hp*=1-.035*MAGIC;
      if(r()<.1425)hp-=100000*1.15*MAGIC;
      break;
    case 'L31':
      if(r()<.20)hp-=155000*MAGIC;
      if(r()<.125){hp-=125000*MAGIC;hp*=1-.25*EXPLOSIVE;}
      break;
    case 'H13':if(r()<.14){hp-=100000*MAGIC;hp*=1-.25*EXPLOSIVE;}break;
    case 'H19':
      if(r()<.15)hp-=300000*MAGIC;
      if(r()<.15)hp*=1-.28*MAGIC;
      break;
    case 'T1':
      if(r()<.10){hp-=200000*MAGIC;hp*=1-.25*MAGIC;}
      if(r()<.10)hp-=100000*MAGIC;
      break;
    case 'H5':
      hp-=11500;
      if(r()<.14){hp-=80000*1.25*MAGIC;hp*=1-.20*EXPLOSIVE;}
      break;
    case 'L6':
      hp-=200000*MAGIC/4.4886; // nonstacking steady-state DOT approximation
      if(r()<.055)for(let i=0;i<3;i++){hp-=100000*MAGIC;hp*=1-.0825*EXPLOSIVE;}
      if(r()<.10){hp-=210000*MAGIC;for(let i=0;i<2;i++)hp*=1-.105*EXPLOSIVE;}
      break;
    case 'D6':hp-=100000*MAGIC;hp*=1-.11*EXPLOSIVE;break; // 2.323 ORDR card; patch history conflicts; elbow excluded
    case 'L36':{
      const active=at<state.buffUntil-1e-10;
      if(active){hp-=.07*SINGLE_MOB.hp*EXPLOSIVE;hp-=(85000+1.25*basic)*MAGIC;}
      else if(r()<.10){hp-=375000*MAGIC;hp-=.05*SINGLE_MOB.hp*EXPLOSIVE;}
      if(r()<.20)hp-=150000*1.05*PHYSICAL;
      if(!active&&r()<.08)state.buffUntil=at+.4;
      const remaining=Math.max(0,state.buffUntil-at);
      state.next+=remaining>=1/hBuffAps?1/hBuffAps:
        remaining>0?remaining+(1-hBuffAps*remaining)/unit.aps:1/unit.aps;
      return hp;
    }
  }
  state.next+=1/unit.aps;
  return hp;
}
function expand(team){
  if(!Array.isArray(team)||team.length===0)throw new Error('유닛을 한 기 이상 넣어 주세요.');
  const units=[];
  for(const item of team){
    const unit=BY_CODE.get(item.code),count=Number(item.count);
    if(!unit||!Number.isInteger(count)||count<1||count>12)throw new Error('유닛과 수량을 확인해 주세요.');
    for(let i=0;i<count;i++)units.push(unit);
  }
  if(units.length>12)throw new Error('단일 테스터는 한 번에 최대 12기까지 계산합니다.');
  return units;
}
function run(units,r,startHp,context){
  let hp=startHp,to15=startHp<=.15*SINGLE_MOB.hp?0:null,to3=null,at=0;
  const state=units.map(unit=>({next:1/unit.aps,buffUntil:0}));
  for(let attacks=0;hp>0&&attacks<12000;attacks++){
    let ix=0;for(let j=1;j<state.length;j++)if(state[j].next<state[ix].next)ix=j;
    const s=state[ix],unit=units[ix];at=s.next;
    if(to3===null&&at>3)to3=Math.max(0,hp);
    hp=hit(unit,hp,r,at,s,context);
    if(to15===null&&hp<=.15*SINGLE_MOB.hp)to15=at;
  }
  if(hp>0)throw new Error('12000회 공격 안에 처치하지 못했습니다.');
  return {to15,kill:at,hpAt3:to3??0};
}
export function simulateSingle(team,{trials=3000,seed=202323,context={}}={}){
  context={magic:.95,all:1,explosive:1,armor:181,...context};
  const units=expand(team);
  if(!Number.isInteger(trials)||trials<100||trials>20000)throw new Error('반복 횟수는 100~20,000회로 입력해 주세요.');
  if(!Number.isInteger(seed)||seed<0||seed>2147483647)throw new Error('시드는 0~2,147,483,647 범위로 입력해 주세요.');
  const r=rng(seed),result={to15:0,kill:0,remainingAt3:0,finishFrom15:0};
  for(let i=0;i<trials;i++){
    const full=run(units,r,SINGLE_MOB.hp,context),finish=run(units,r,.15*SINGLE_MOB.hp,context);
    result.to15+=full.to15;result.kill+=full.kill;
    result.remainingAt3+=full.hpAt3;result.finishFrom15+=finish.kill;
  }
  for(const key of Object.keys(result))result[key]/=trials;
  return {...result,trials,seed,count:units.length,team};
}
export function referenceSingle({trials=3000,seed=202323,context={}}={}){
  const lucci=simulateSingle([{code:'L9',count:1}],{trials,seed,context});
  const hancock=simulateSingle([{code:'L36',count:1}],{trials,seed,context});
  return {lucci,hancock};
}
