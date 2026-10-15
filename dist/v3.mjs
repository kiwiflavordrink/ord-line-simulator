import {SUPPORTS} from './engine.mjs';
import {simulateV2,DELETERS,CONDITIONAL_UNITS,SUPPORT_AURAS} from './engine_v3.mjs';
import {SINGLE_MOB,SINGLE_UNITS,simulateSingle,referenceSingle} from './engine_single_v3.mjs';
import {EFFECTS,damageContext} from './v3_effects.mjs';

const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(n);
const params=new URL(location.href).searchParams;
let data,pending=false;
const waveNames={60:['제우스','o02G'],61:['바질 호킨스','o026'],62:['잭','o025'],63:['퀸','o027'],64:['킹','o00K'],65:['오로치','o02H']};
const bossNames={60:'빅 맘 (2.305)',65:'카이도'};
const sec=n=>`${n.toFixed(2)}초`;
const singleRefs=new Map();
function context(){return damageContext({
  selected:[...document.querySelectorAll('.amp-effect:checked')].map(e=>e.value),
  customMagicAmp:val('v3-custom-mamp'),customMagicCut:val('v3-custom-mcut'),
  customAllAmp:val('v3-custom-all'),customExplosiveAmp:val('v3-custom-explosive'),
  warcury:$('v3-warcury').checked
});}
function syncEffects(){
  const c=context();
  $('v3-formula').textContent=`마방 단계 ${c.level} → ${c.defenceFactor.toFixed(2)} × 마법 증폭 ${(1+c.magicAmp/100).toFixed(2)} × 모든 피해 ${(1+c.allAmp/100).toFixed(2)} = 마법 피해 배율 ${(c.magic*c.all).toFixed(3)} · 폭발형 ${(c.explosive*c.all).toFixed(3)} · 물리 방어 ${c.armor}`;
  $('v3-effect-count').textContent=`선택 효과 ${c.enabled.length}개 · 마법 증폭 ${c.magicAmp}% · 마방 감소 ${c.magicCut}%p · 폭발형 증폭 ${c.explosiveAmp}%`;
  $('single-explain').textContent='상황이 바뀌었습니다. 계산 버튼을 눌러 결과를 갱신하세요.';
  schedule();
}
function setupEffects(){
  const groups={magicAmp:'마법 피해 증폭',magicCut:'마법방어력 감소',allAmp:'모든 피해 증폭',explosiveAmp:'폭발형 증폭'};
  for(const [kind,title] of Object.entries(groups)){
    const box=document.createElement('fieldset');box.className='effect-group';
    const legend=document.createElement('legend');legend.textContent=title;box.appendChild(legend);
    for(const e of EFFECTS.filter(x=>x.kind===kind)){
      const label=document.createElement('label');label.className='effect-option';
      const input=document.createElement('input');input.type='checkbox';input.className='amp-effect';input.value=e.code;
      input.checked=params.getAll('effect').includes(e.code);label.appendChild(input);
      const name=document.createElement('span');name.textContent=`${e.name} +${e.value}% · ${e.scope}`;label.appendChild(name);
      const link=document.createElement('a');link.href=e.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='툴팁 ↗';label.appendChild(link);
      box.appendChild(label);
    }
    $('v3-effect-list').appendChild(box);
  }
  for(const [param,id] of [['warcury','v3-warcury'],['customMamp','v3-custom-mamp'],['customMcut','v3-custom-mcut'],['customAll','v3-custom-all'],['customExplosive','v3-custom-explosive']]){
    if(!params.has(param))continue;
    if(param==='warcury')$(id).checked=params.get(param)==='1';else $(id).value=params.get(param);
  }
  $('v3-effect-settings').addEventListener('input',syncEffects);
  syncEffects();
}
const nameOf=code=>code==='H2'?'레드포스호 히든':code==='MAGIC_CUSTOM'?'직접 입력 마딜':code==='단일 마무리'?code:
  data.heroes.find(h=>h.code===code)?.name??SUPPORTS[code]?.name??DELETERS[code]?.name??CONDITIONAL_UNITS[code]?.name??code;

function unitSelect(value){
  const sel=document.createElement('select');sel.className='unit-select';sel.setAttribute('aria-label','조합 유닛');
  const groups=new Map();
  for(const h of data.heroes){
    if(!groups.has(h.grade)){const g=document.createElement('optgroup');g.label=h.grade;sel.appendChild(g);groups.set(h.grade,g);}
    const o=document.createElement('option');o.value=h.code;o.textContent=h.name;groups.get(h.grade).appendChild(o);
  }
  const g=document.createElement('optgroup');g.label='보조딜 · 암브';sel.appendChild(g);
  for(const [code,s] of Object.entries(SUPPORTS)){const o=document.createElement('option');o.value=code;o.textContent=s.name;g.appendChild(o);}
  const cg=document.createElement('optgroup');cg.label='조건형 · 마나 · 스턴';sel.appendChild(cg);
  for(const [code,s] of Object.entries(CONDITIONAL_UNITS)){const o=document.createElement('option');o.value=code;o.textContent=s.name;cg.appendChild(o);}
  const dg=document.createElement('optgroup');dg.label='삭제 · 별도 집계';sel.appendChild(dg);
  for(const [code,s] of Object.entries(DELETERS)){const o=document.createElement('option');o.value=code;o.textContent=s.name;dg.appendChild(o);}
  const o=document.createElement('option');o.value='MAGIC_CUSTOM';o.textContent='직접 입력 마딜';sel.appendChild(o);
  sel.value=value&&([...data.heroes.map(h=>h.code),...Object.keys(SUPPORTS),...Object.keys(DELETERS),...Object.keys(CONDITIONAL_UNITS),'MAGIC_CUSTOM'].includes(value))?value:'TR19';
  return sel;
}

function addRow(item={code:'TR19',count:1,damage:true,ab:true}){
  const row=document.createElement('div');row.className='unit-row';
  row.appendChild(unitSelect(item.code));
  const count=document.createElement('input');count.type='number';count.min='1';count.max='6';count.step='1';count.value=item.count??1;count.className='unit-count';count.setAttribute('aria-label','유닛 수');row.appendChild(count);
  const damage=document.createElement('label');damage.className='tiny-check';
  damage.innerHTML='<input type="checkbox" class="unit-damage"><span>딜</span>';
  damage.querySelector('input').checked=item.damage!==false;row.appendChild(damage);
  const ab=document.createElement('label');ab.className='tiny-check unit-ab-wrap';
  ab.innerHTML='<input type="checkbox" class="unit-ab"><span>암브</span>';
  ab.querySelector('input').checked=item.ab!==false;row.appendChild(ab);
  const remove=document.createElement('button');remove.type='button';remove.className='unit-remove';remove.textContent='×';remove.setAttribute('aria-label','조합에서 제거');row.appendChild(remove);
  $('team').appendChild(row);
  const sync=()=>{const code=row.querySelector('select').value;ab.hidden=!SUPPORTS[code];damage.querySelector('span').textContent=DELETERS[code]?'삭제':'딜';$('magic-settings').hidden=![...$('team').querySelectorAll('.unit-select')].some(x=>x.value==='MAGIC_CUSTOM');schedule();};
  row.addEventListener('input',sync);
  remove.addEventListener('click',()=>{if($('team').children.length<=1)return;row.remove();sync();});
  sync();
}

// Buff target panel: one row per buff source in the team, one checkbox per hero in the team.
const buffState={};let buffSignature='';
function buffSources(codes){
  const heroes=new Map(data.heroes.map(h=>[h.code,h]));
  return [...new Set(codes)].filter(c=>(heroes.get(c)?.auras??SUPPORT_AURAS[c]??[]).some(a=>a.targets!=='self'));
}
function syncBuffPanel(){
  const codes=team().map(t=>t.code),heroCodes=[...new Set(codes.filter(c=>data.heroes.some(h=>h.code===c)))];
  const sources=buffSources(codes),signature=JSON.stringify([sources,heroCodes]);
  $('buff-settings').hidden=!sources.length;
  if(signature===buffSignature)return;
  buffSignature=signature;
  const box=$('buff-targets');box.innerHTML='';
  for(const src of sources){
    const line=document.createElement('div');line.className='buff-line';
    const title=document.createElement('strong');title.textContent=nameOf(src)+' →';line.appendChild(title);
    for(const tgt of heroCodes){
      const label=document.createElement('label');label.className='tiny-check';
      const input=document.createElement('input');input.type='checkbox';input.dataset.src=src;input.dataset.tgt=tgt;
      input.checked=buffState[src]?.[tgt]??true;
      input.addEventListener('change',()=>{(buffState[src]??={})[tgt]=input.checked;});
      const span=document.createElement('span');span.textContent=nameOf(tgt);
      label.append(input,span);line.appendChild(label);
    }
    box.appendChild(line);
  }
}
function buffTargets(){
  const out={};
  for(const line of document.querySelectorAll('#buff-targets .buff-line')){
    const boxes=[...line.querySelectorAll('input')];
    if(boxes.every(b=>b.checked))continue;
    out[boxes[0].dataset.src]=boxes.filter(b=>b.checked).map(b=>b.dataset.tgt);
  }
  return out;
}

function team(){return [...$('team').children].map(row=>({code:row.querySelector('select').value,
  count:Number(row.querySelector('.unit-count').value),damage:row.querySelector('.unit-damage').checked,
  ab:row.querySelector('.unit-ab').checked}));}
const val=id=>Number($(id).value)||0;
function options(){const c=context();return {
  cut:val('cut-v2'),coverage:val('coverage-v2')/100,magicReduction:c.magicCut/100,magicAmp:c.magicAmp/100,
  allAmp:c.allAmp/100,explosiveAmp:c.generalExplosiveAmp/100,
  normalOnlyExplosiveAmp:c.normalOnlyExplosiveAmp/100,warcury:c.warcury,
  red:$('red-v2').checked,redDamage:$('red-v2').checked,fullResource:$('resource-v2').checked,summons:$('summons-v2').checked,
  frankyAura:$('franky-aura').checked,sunnyStagger:$('sunny-stagger').checked,
  tr19Plants:{pea:val('tr19-pea'),snow:val('tr19-snow'),muk:val('tr19-muk')},
  buffTargets:buffTargets(),positionModel:$('position-v3').checked,
  customMagic:{aps:val('magic-aps'),chance:val('magic-chance')/100,flat:val('magic-flat'),
    maxPct:val('magic-max')/100,currentPct:val('magic-current')/100,lostPct:val('magic-lost')/100},
  finisher:{mode:$('finish-mode').value,interval:val('finish-interval'),successChance:val('finish-chance')/100,
    damageType:$('finish-type').value,flat:val('finish-flat'),maxPct:val('finish-max')/100,
    currentPct:val('finish-current')/100,lostPct:val('finish-lost')/100},
  deletion:{L12Cooldown:val('moria-cd'),D4Cooldown:val('perona-cd'),L19Cooldown:val('sugar-cd'),seed:val('delete-seed'),
    L12Proc:val('moria-proc')/100,D4Proc:val('perona-proc')/100}
};}

function renderChart(result){
  const svg=$('v2-chart'),w=800,h=260,l=34,r=16,t=13,b=30;
  const x=sec=>l+sec/192*(w-l-r),y=n=>h-b-n/60*(h-t-b);
  const grid=[0,20,40,55].map(v=>`<g><line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" stroke="${v===55?'#a55255':'#294253'}" stroke-dasharray="${v===55?'5 5':'0'}"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" fill="#8ea6b7" font-size="11">${v}</text></g>`).join('');
  const dividers=[60,61,62,63,64,65].map((v,i)=>`<g><line x1="${x(i*32)}" y1="${t}" x2="${x(i*32)}" y2="${h-b}" stroke="#294253"/><text x="${x(i*32+16)}" y="${h-8}" text-anchor="middle" fill="#8ea6b7" font-size="11">${v}라</text></g>`).join('');
  const pts=result.timeline.map(p=>`${x(p.second).toFixed(2)},${y(p.count).toFixed(2)}`).join(' ');
  svg.innerHTML=`<title>60~65라 생존 몹 수</title>${grid}${dividers}<polyline points="${pts}" fill="none" stroke="${result.clear?'#66d5b1':'#f07470'}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function render(){
  if(data)syncBuffPanel();
  if(!data)return;
  $('finish-damage-settings').hidden=$('finish-mode').value!=='damage';
  const chosen=team(),opts=options();
  try{
    const r=simulateV2(data,chosen,opts);
    const without=opts.finisher.mode==='off'?r:simulateV2(data,chosen,{...opts,finisher:{...opts.finisher,mode:'off'}});
    $('v2-verdict-label').textContent=r.clear?'55기 미만 유지':'패배 기준 도달';
    $('v2-verdict-label').classList.toggle('failed',!r.clear);
    $('v2-verdict').textContent=r.clear?'65라 종료까지 유지':`${r.failedRound}라에서 한계 도달`;
    $('v2-verdict-detail').textContent=r.clear?`65라 종료 시 ${r.remaining}기 생존 · 선택 유닛 ${r.unitCount}기`:
      `${r.failedRound}라 ${r.failedSecond.toFixed(1)}초에 55기 도달 · 이후 계산 중단`;
    $('v2-remaining').textContent=fmt(r.remaining);
    $('v2-spawned').textContent=`라인 ${fmt(r.totalLineSpawned)}기 출현`;
    $('v2-area').textContent=fmt(r.lineDamage.area);
    $('v2-magic').textContent=fmt(r.sourceDamage.MAGIC_CUSTOM??0);
    $('v2-finish').textContent=`${r.finisherAttempts} / ${r.finisherKills}`;
    $('v2-without').textContent=without.clear?`${without.remaining}기`:`${without.failedRound}라 패배`;
    $('v2-deleted').textContent=fmt(Object.values(r.deleteCounts).reduce((a,b)=>a+b,0));
    $('v3-sunny-casts').textContent=fmt(r.control.sunnyCasts);
    $('v3-stun-uptime').textContent=r.control.activeLineMobSeconds?
      `${(100*r.control.stunnedLineMobSeconds/r.control.activeLineMobSeconds).toFixed(1)}%`:'—';
    $('v3-gaban-single').textContent=fmt(r.lineDamage.single);
    const deletionBody=$('v2-deletions');deletionBody.innerHTML='';
    for(const [code,count] of Object.entries(r.deleteCounts))if(chosen.some(u=>u.code===code)){
      const tr=document.createElement('tr');for(const s of [nameOf(code),`${count}기`,`${opts.deletion[`${code}Cooldown`]}초`,code==='L19'?'액티브':`${fmt(opts.deletion[`${code}Proc`]*100)}%`]){const td=document.createElement('td');td.textContent=s;tr.appendChild(td);}deletionBody.appendChild(tr);
    }
    renderChart(r);
    const body=$('v2-rounds');body.innerHTML='';
    for(const q of r.checkpoints){const tr=document.createElement('tr');
      for(const s of [`${q.round}라`,`${q.remaining}기`,`${q.lineRemaining}기`,`${q.priorRoundRemaining}기`,q.averageAb.toFixed(1),q.specialKillSecond==null?'—':`${q.specialKillSecond.toFixed(1)}초`]){
        const td=document.createElement('td');td.textContent=s;tr.appendChild(td);
      }body.appendChild(tr);
    }
    const sources=$('v2-sources');sources.innerHTML='';
    for(const [code,damage] of Object.entries(r.sourceDamage).sort((a,b)=>b[1]-a[1])){
      const tr=document.createElement('tr');for(const s of [nameOf(code),fmt(damage)]){const td=document.createElement('td');td.textContent=s;tr.appendChild(td);}sources.appendChild(tr);
    }
  }catch(error){$('v2-verdict').textContent='계산 불가';$('v2-verdict-detail').textContent=String(error.message??error);}
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;render();});}

function renderMobs(){
  const body=$('mob-rows');body.innerHTML='';
  for(const round of [60,61,62,63,64,65]){
    const [hp,armor,type]=data.rounds[String(round)];
    const special=data.boss[String(round)]?'보스':data.frenzy[String(round)]?'광폭':'—';
    const specialHp=data.boss[String(round)]?.[0]??data.frenzy[String(round)]??null;
    const specialArmor=data.boss[String(round)]?.[1]??(data.frenzy[String(round)]?armor+5:null);
    const [name,raw]=waveNames[round];
    const tr=document.createElement('tr');
    for(const s of [`${round}라`,`${name} (${raw})`,fmt(hp),fmt(armor),type,special==='보스'?`${bossNames[round]} 보스`:special,specialHp?fmt(specialHp):'—',specialArmor==null?'—':fmt(specialArmor),special==='보스'?'시작':'7.5초',special==='보스'?'550,000':round===61?'1,045,000':'1,000,000']){
      const td=document.createElement('td');td.textContent=s;tr.appendChild(td);
    }body.appendChild(tr);
  }
}

function addSingleRow(item={code:'L9',count:1}){
  const row=document.createElement('div');row.className='single-unit-row';
  const select=document.createElement('select');select.setAttribute('aria-label','단일 테스터 유닛');
  for(const group of ['단일','조건부 단일','끝딜']){
    const g=document.createElement('optgroup');g.label=group;
    for(const unit of SINGLE_UNITS.filter(u=>u.role===group)){
      const option=document.createElement('option');option.value=unit.code;option.textContent=unit.name;g.appendChild(option);
    }
    select.appendChild(g);
  }
  select.value=SINGLE_UNITS.some(u=>u.code===item.code)?item.code:'L9';row.appendChild(select);
  const count=document.createElement('input');count.className='unit-count';count.type='number';count.min='1';count.max='12';count.step='1';count.value=item.count??1;count.setAttribute('aria-label','같은 유닛 수');row.appendChild(count);
  const source=document.createElement('a');source.className='single-source';source.target='_blank';source.rel='noopener noreferrer';source.textContent='툴팁 ↗';row.appendChild(source);
  const remove=document.createElement('button');remove.className='unit-remove';remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','단일 테스터에서 제거');row.appendChild(remove);
  const sync=()=>{source.href=SINGLE_UNITS.find(u=>u.code===select.value).source;$('single-explain').textContent='조합이 바뀌었습니다. 계산 버튼을 눌러 결과를 갱신하세요.';};
  select.addEventListener('change',sync);count.addEventListener('input',sync);
  remove.addEventListener('click',()=>{if($('single-team').children.length<=1)return;row.remove();sync();});
  $('single-team').appendChild(row);sync();
}
function singleTeam(){return [...$('single-team').children].map(row=>({code:row.querySelector('select').value,count:Number(row.querySelector('input').value)}));}
function runSingle(){
  const button=$('single-run');button.disabled=true;button.firstChild.textContent='계산 중… ';
  $('single-error').hidden=true;
  setTimeout(()=>{
    try{
      const trials=Number($('single-trials').value),seed=Number($('single-seed').value);
      const c=context();
      const key=`${trials}:${seed}:${c.magic}:${c.all}:${c.explosive}:${c.armor}`;
      if(!singleRefs.has(key))singleRefs.set(key,referenceSingle({trials,seed,context:c}));
      const refs=singleRefs.get(key),team=singleTeam();
      const r=simulateSingle(team,{trials,seed,context:c});
      $('single-to15').textContent=sec(r.to15);
      $('single-dan').textContent=`루치 기준 ${(refs.lucci.to15/r.to15).toFixed(3)}단`;
      $('single-kill').textContent=sec(r.kill);
      $('single-finish').textContent=sec(r.finishFrom15);
      $('single-end').textContent=`핸콕 기준 ${(refs.hancock.finishFrom15/r.finishFrom15).toFixed(3)}끝`;
      $('single-three').textContent=fmt(r.remainingAt3);
      $('single-three-pct').textContent=`원래 HP의 ${(r.remainingAt3/SINGLE_MOB.hp*100).toFixed(1)}%`;
      $('single-reference').textContent=`루치 1기: 100→15% ${sec(refs.lucci.to15)} · 핸콕 1기: 15→처치 ${sec(refs.hancock.finishFrom15)}`;
      $('single-explain').textContent=`${r.count}기가 같은 65라 몹 한 기를 동시에 공격 · ${fmt(trials)}회 평균 · 시드 ${seed} · 마법 배율 ${(c.magic*c.all).toFixed(3)}`;
    }catch(error){$('single-error').textContent=String(error.message??error);$('single-error').hidden=false;}
    finally{button.disabled=false;button.firstChild.textContent='단일 효율 계산 ';}
  },0);
}
function singleShareURL(){
  const url=new URL(location.href);url.searchParams.set('singleTeam',JSON.stringify(singleTeam()));
  url.searchParams.set('singleTrials',$('single-trials').value);url.searchParams.set('singleSeed',$('single-seed').value);
  url.searchParams.delete('effect');
  for(const e of document.querySelectorAll('.amp-effect:checked'))url.searchParams.append('effect',e.value);
  url.searchParams.set('warcury',$('v3-warcury').checked?'1':'0');
  for(const [param,id] of [['customMamp','v3-custom-mamp'],['customMcut','v3-custom-mcut'],['customAll','v3-custom-all'],['customExplosive','v3-custom-explosive']])url.searchParams.set(param,$(id).value);
  url.hash='single-tester';history.replaceState(null,'',url);return url.href;
}
function setupSingle(){
  try{
    const parsed=JSON.parse(params.get('singleTeam')??'null');
    if(Array.isArray(parsed)&&parsed.length>0&&parsed.length<=12&&parsed.every(x=>SINGLE_UNITS.some(u=>u.code===x.code)))parsed.forEach(addSingleRow);
    else{addSingleRow({code:'L9',count:1});addSingleRow({code:'L36',count:1});}
  }catch{addSingleRow({code:'L9',count:1});addSingleRow({code:'L36',count:1});}
  for(const [key,id] of [['singleTrials','single-trials'],['singleSeed','single-seed']])if(params.has(key))$(id).value=params.get(key);
  $('single-add').addEventListener('click',()=>addSingleRow({code:'L9',count:1}));
  $('single-run').addEventListener('click',runSingle);
  $('single-share').addEventListener('click',async()=>{
    const url=singleShareURL();try{await navigator.clipboard.writeText(url);$('single-share').textContent='링크 복사됨';}
    catch{$('single-share').textContent='주소창 링크를 복사하세요';}
    setTimeout(()=>$('single-share').textContent='이 단일 조합 링크 복사',2200);
  });
  runSingle();
}

function restore(){
  try{const parsed=JSON.parse(params.get('team')??'null');if(Array.isArray(parsed)&&parsed.length>0&&parsed.length<=16)parsed.forEach(addRow);else addRow();}catch{addRow();}
  for(const [key,id] of [['cut','cut-v2'],['coverage','coverage-v2'],
    ['magicAps','magic-aps'],['magicChance','magic-chance'],['magicFlat','magic-flat'],['magicMax','magic-max'],
    ['magicCurrent','magic-current'],['magicLost','magic-lost'],['finishInterval','finish-interval'],
    ['finishChance','finish-chance'],['finishFlat','finish-flat'],['finishMax','finish-max'],
    ['finishCurrent','finish-current'],['finishLost','finish-lost'],['moriaCd','moria-cd'],['peronaCd','perona-cd'],['sugarCd','sugar-cd'],['moriaProc','moria-proc'],['peronaProc','perona-proc'],['deleteSeed','delete-seed']]){
    if(params.has(key)&&Number.isFinite(Number(params.get(key))))$(id).value=params.get(key);
  }
  if(['off','damage'].includes(params.get('finishMode')))$('finish-mode').value=params.get('finishMode');
  if(['magic','physical','fixed','explosive'].includes(params.get('finishType')))$('finish-type').value=params.get('finishType');
  $('red-v2').checked=params.get('red')!=='0';$('resource-v2').checked=params.get('resource')!=='0';
  $('summons-v2').checked=params.get('summons')!=='0';
  $('franky-aura').checked=params.get('frankyAura')!=='0';
  $('sunny-stagger').checked=params.get('sunnyStagger')==='1';
  $('position-v3').checked=params.get('position')==='1';
  for(const k of ['pea','snow','muk'])if(params.has('tr19'+k))$('tr19-'+k).value=params.get('tr19'+k);
  try{for(const [src,tgts] of Object.entries(JSON.parse(params.get('buffTargets')||'{}')))for(const t of data.heroes.map(h=>h.code))(buffState[src]??={})[t]=tgts.includes(t);}catch{}
}
function shareURL(){
  const u=new URL(location.href);u.search='';u.searchParams.set('team',JSON.stringify(team()));
  for(const [key,id] of [['cut','cut-v2'],['coverage','coverage-v2'],
    ['magicAps','magic-aps'],['magicChance','magic-chance'],['magicFlat','magic-flat'],['magicMax','magic-max'],
    ['magicCurrent','magic-current'],['magicLost','magic-lost'],['finishInterval','finish-interval'],
    ['finishChance','finish-chance'],['finishFlat','finish-flat'],['finishMax','finish-max'],
    ['finishCurrent','finish-current'],['finishLost','finish-lost'],['moriaCd','moria-cd'],['peronaCd','perona-cd'],['sugarCd','sugar-cd'],['moriaProc','moria-proc'],['peronaProc','perona-proc'],['deleteSeed','delete-seed']])u.searchParams.set(key,$(id).value);
  u.searchParams.set('finishMode',$('finish-mode').value);u.searchParams.set('finishType',$('finish-type').value);
  u.searchParams.set('red',$('red-v2').checked?'1':'0');u.searchParams.set('resource',$('resource-v2').checked?'1':'0');
  u.searchParams.set('summons',$('summons-v2').checked?'1':'0');
  u.searchParams.set('frankyAura',$('franky-aura').checked?'1':'0');
  u.searchParams.set('sunnyStagger',$('sunny-stagger').checked?'1':'0');
  u.searchParams.set('position',$('position-v3').checked?'1':'0');
  for(const k of ['pea','snow','muk'])u.searchParams.set('tr19'+k,$('tr19-'+k).value);
  const bt=buffTargets();if(Object.keys(bt).length)u.searchParams.set('buffTargets',JSON.stringify(bt));
  for(const e of document.querySelectorAll('.amp-effect:checked'))u.searchParams.append('effect',e.value);
  u.searchParams.set('warcury',$('v3-warcury').checked?'1':'0');
  for(const [param,id] of [['customMamp','v3-custom-mamp'],['customMcut','v3-custom-mcut'],['customAll','v3-custom-all'],['customExplosive','v3-custom-explosive']])u.searchParams.set(param,$(id).value);
  history.replaceState(null,'',u);return u.href;
}
async function main(){
  try{const response=await fetch('./data.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    data=await response.json();restore();setupEffects();renderMobs();render();setupSingle();
    $('add-unit').addEventListener('click',()=>addRow({code:'MAGIC_CUSTOM'}));
    document.querySelector('.v2-controls').addEventListener('input',schedule);
    $('share-v2').addEventListener('click',async()=>{const href=shareURL();try{await navigator.clipboard.writeText(href);$('share-v2').firstChild.textContent='조합 링크 복사됨 ';}catch{$('share-v2').firstChild.textContent='주소창 링크를 복사하세요 ';}
      setTimeout(()=>$('share-v2').firstChild.textContent='현재 조합 링크 복사 ',2200);});
  }catch(error){$('v2-verdict').textContent='데이터를 불러오지 못했습니다';$('v2-verdict-detail').textContent=String(error.message??error);}
}
main();
