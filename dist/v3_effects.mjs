// Current tooltip values (ORDR 2.323). Checked effects are assumed active on the target.
// Map mechanics: A04Q (magic defence), A04R (magic amplification), A11S (explosive amplification).
export const EFFECTS=[
  {code:'L1',name:'검은수염 전설 · 크로우즈',kind:'magicAmp',value:8,scope:'단일',url:'https://ordr.kr/character/L1'},
  {code:'L1_ALL',name:'검은수염 전설 · 크로우즈 모든 피해',kind:'allAmp',value:10,scope:'단일',url:'https://ordr.kr/character/L1'},
  {code:'L2',name:'나미 전설',kind:'magicAmp',value:1,scope:'범위',url:'https://ordr.kr/character/L2'},
  {code:'H19',name:'캐럿 히든',kind:'magicAmp',value:1,scope:'범위',url:'https://ordr.kr/character/H19'},
  {code:'MY8',name:'아냐 포저 신비',kind:'magicAmp',value:1,scope:'범위',url:'https://ordr.kr/character/MY8'},
  {code:'SR4',name:'S-베어 세라핌',kind:'magicAmp',value:3,scope:'범위·5초 쿨',url:'https://ordr.kr/character/SR4'},
  {code:'TR1',name:'검은수염 초월 · 크로우즈',kind:'magicAmp',value:10,scope:'단일',url:'https://ordr.kr/character/TR1'},
  {code:'TR1_ALL',name:'검은수염 초월 · 모든 피해',kind:'allAmp',value:10,scope:'단일',url:'https://ordr.kr/character/TR1'},
  {code:'TR2',name:'나미 초월',kind:'magicAmp',value:2,scope:'범위',url:'https://ordr.kr/character/TR2'},
  {code:'TR10',name:'브룩 초월',kind:'magicAmp',value:10,scope:'범위',url:'https://ordr.kr/character/TR10'},
  {code:'E8',name:'오뎅 영원',kind:'magicAmp',value:1,scope:'범위·중첩',url:'https://ordr.kr/character/E8'},
  {code:'I9',name:'시키 불멸 · 눈',kind:'magicAmp',value:15,scope:'피격 대상',url:'https://ordr.kr/character/I9'},
  {code:'I9_EXTRA',name:'시키 불멸 · 추가',kind:'magicAmp',value:1,scope:'피격 대상',url:'https://ordr.kr/character/I9'},
  {code:'H9',name:'방주맥심 히든 · 마방 감소',kind:'magicCut',value:10,scope:'범위',url:'https://ordr.kr/character/H9'},
  {code:'MY8_CUT',name:'아냐 포저 신비 · 마방 감소',kind:'magicCut',value:10,scope:'단일·1회',url:'https://ordr.kr/character/MY8'},
  {code:'SR4_CUT',name:'S-베어 세라핌 · 마방 감소',kind:'magicCut',value:1,scope:'범위·중첩',url:'https://ordr.kr/character/SR4'},
  {code:'TR10_CUT',name:'브룩 초월 · 마방 감소',kind:'magicCut',value:3,scope:'오라',url:'https://ordr.kr/character/TR10'},
  {code:'E9_CUT',name:'우타 영원 · 마방 감소',kind:'magicCut',value:10,scope:'범위',url:'https://ordr.kr/character/E9'},
  {code:'E12_CUT',name:'핸콕 영원 · 마방 감소',kind:'magicCut',value:5,scope:'오라',url:'https://ordr.kr/character/E12'},
  {code:'H9_EXP',name:'방주맥심 히든 · 폭발형 증폭',kind:'explosiveAmp',value:10,scope:'범위',url:'https://ordr.kr/character/H9'},
  {code:'H16',name:'아오키지 히든 · 폭발형 증폭',kind:'explosiveAmp',value:10,scope:'라인',url:'https://ordr.kr/character/H16'},
  {code:'D4',name:'페로나 왜곡 · 폭발형 증폭',kind:'explosiveAmp',value:2,scope:'범위',url:'https://ordr.kr/character/D4'},
  {code:'D4_SKILL',name:'페로나 왜곡 · 특강 폭발형 증폭',kind:'explosiveAmp',value:10,scope:'라인',url:'https://ordr.kr/character/D4'},
  {code:'TR16',name:'아오키지 초월 · 폭발형 증폭',kind:'explosiveAmp',value:10,scope:'라인',excludes:['H16'],url:'https://ordr.kr/character/TR16'},
  {code:'E9',name:'우타 영원 · 폭발형 증폭',kind:'explosiveAmp',value:10,scope:'범위',url:'https://ordr.kr/character/E9'},
  {code:'I2',name:'드래곤 불멸 · 체력비례 폭발형',kind:'explosiveAmp',value:20,scope:'라인 일반몹 한정',url:'https://ordr.kr/character/I2'}
];
export function damageContext({selected=[],customMagicAmp=0,customMagicCut=0,customAllAmp=0,customExplosiveAmp=0,warcury=false,armor=181}={}){
  // Tooltip stacking rules: TR16 "아오키지히든과 중첩 불가능" drops H16 when both are checked.
  const chosen=EFFECTS.filter(e=>selected.includes(e.code));
  const excluded=new Set(chosen.flatMap(e=>e.excludes??[]));
  const enabled=chosen.filter(e=>!excluded.has(e.code));
  const sum=k=>enabled.filter(e=>e.kind===k).reduce((n,e)=>n+e.value,0);
  const magicAmp=Math.min(25,Math.max(0,sum('magicAmp')+Number(customMagicAmp||0)));
  const magicCut=Math.max(0,sum('magicCut')+Number(customMagicCut||0));
  const normalOnlyExplosiveAmp=enabled.some(e=>e.code==='I2')?20:0;
  const generalExplosiveAmp=Math.max(0,sum('explosiveAmp')-normalOnlyExplosiveAmp+Number(customExplosiveAmp||0));
  const explosiveAmp=Math.min(25,generalExplosiveAmp+normalOnlyExplosiveAmp);
  const allAmp=Math.max(0,sum('allAmp')+Number(customAllAmp||0));
  // 2.305 A04Q: level 16 = 0.95; each level is one percentage point, levels 1..36.
  // 2.310 raised God Warcury's magic resistance from 7 to 10 points.
  const level=Math.min(36,Math.max(1,16+(warcury?-10:0)+magicCut));
  const defenceFactor=.79+.01*level;
  const magic=defenceFactor*(1+magicAmp/100);
  const explosive=1+explosiveAmp/100;
  const all=1+allAmp/100;
  const finalArmor=Number(armor)+(warcury?10:0);
  return {enabled,level,defenceFactor,magicAmp,magicCut,explosiveAmp,
    generalExplosiveAmp:Math.min(25,generalExplosiveAmp),normalOnlyExplosiveAmp,
    allAmp,magic,explosive,all,armor:finalArmor,warcury};
}
