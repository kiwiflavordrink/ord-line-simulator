import {SUPPORTS} from './engine.mjs';
import {simulateV2} from './engine_v2.mjs';

const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(n);
const params=new URL(location.href).searchParams;
let data,pending=false;
const waveNames={60:['제우스','o02G'],61:['바질 호킨스','o026'],62:['잭','o025'],63:['퀸','o027'],64:['킹','o00K'],65:['오로치','o02H']};
const bossNames={60:'빅 맘 (2.305)',65:'카이도'};
const nameOf=code=>code==='H2'?'레드포스호 히든':code==='MAGIC_CUSTOM'?'직접 입력 마딜':code==='단일 마무리'?code:
  data.heroes.find(h=>h.code===code)?.name??SUPPORTS[code]?.name??code;

function unitSelect(value){
  const sel=document.createElement('select');sel.className='unit-select';sel.setAttribute('aria-label','조합 유닛');
  const groups=new Map();
  for(const h of data.heroes){
    if(!groups.has(h.grade)){const g=document.createElement('optgroup');g.label=h.grade;sel.appendChild(g);groups.set(h.grade,g);}
    const o=document.createElement('option');o.value=h.code;o.textContent=h.name;groups.get(h.grade).appendChild(o);
  }
  const g=document.createElement('optgroup');g.label='보조딜 · 암브';sel.appendChild(g);
  for(const [code,s] of Object.entries(SUPPORTS)){const o=document.createElement('option');o.value=code;o.textContent=s.name;g.appendChild(o);}
  const o=document.createElement('option');o.value='MAGIC_CUSTOM';o.textContent='직접 입력 마딜';sel.appendChild(o);
  sel.value=value&&([...data.heroes.map(h=>h.code),...Object.keys(SUPPORTS),'MAGIC_CUSTOM'].includes(value))?value:'TR19';
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
  const sync=()=>{ab.hidden=!SUPPORTS[row.querySelector('select').value];$('magic-settings').hidden=![...$('team').querySelectorAll('.unit-select')].some(x=>x.value==='MAGIC_CUSTOM');schedule();};
  row.addEventListener('input',sync);
  remove.addEventListener('click',()=>{if($('team').children.length<=1)return;row.remove();sync();});
  sync();
}

function team(){return [...$('team').children].map(row=>({code:row.querySelector('select').value,
  count:Number(row.querySelector('.unit-count').value),damage:row.querySelector('.unit-damage').checked,
  ab:row.querySelector('.unit-ab').checked}));}
const val=id=>Number($(id).value)||0;
function options(){return {
  cut:val('cut-v2'),coverage:val('coverage-v2')/100,magicReduction:val('mdef-v2')/100,magicAmp:val('mamp-v2')/100,
  red:$('red-v2').checked,redDamage:$('red-v2').checked,fullResource:$('resource-v2').checked,summons:$('summons-v2').checked,
  customMagic:{aps:val('magic-aps'),chance:val('magic-chance')/100,flat:val('magic-flat'),
    maxPct:val('magic-max')/100,currentPct:val('magic-current')/100,lostPct:val('magic-lost')/100},
  finisher:{mode:$('finish-mode').value,interval:val('finish-interval'),successChance:val('finish-chance')/100,
    damageType:$('finish-type').value,flat:val('finish-flat'),maxPct:val('finish-max')/100,
    currentPct:val('finish-current')/100,lostPct:val('finish-lost')/100}
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

function restore(){
  try{const parsed=JSON.parse(params.get('team')??'null');if(Array.isArray(parsed)&&parsed.length>0&&parsed.length<=16)parsed.forEach(addRow);else addRow();}catch{addRow();}
  for(const [key,id] of [['cut','cut-v2'],['coverage','coverage-v2'],['mdef','mdef-v2'],['mamp','mamp-v2'],
    ['magicAps','magic-aps'],['magicChance','magic-chance'],['magicFlat','magic-flat'],['magicMax','magic-max'],
    ['magicCurrent','magic-current'],['magicLost','magic-lost'],['finishInterval','finish-interval'],
    ['finishChance','finish-chance'],['finishFlat','finish-flat'],['finishMax','finish-max'],
    ['finishCurrent','finish-current'],['finishLost','finish-lost']]){
    if(params.has(key)&&Number.isFinite(Number(params.get(key))))$(id).value=params.get(key);
  }
  if(['off','damage'].includes(params.get('finishMode')))$('finish-mode').value=params.get('finishMode');
  if(['magic','physical','fixed','explosive'].includes(params.get('finishType')))$('finish-type').value=params.get('finishType');
  $('red-v2').checked=params.get('red')!=='0';$('resource-v2').checked=params.get('resource')!=='0';
  $('summons-v2').checked=params.get('summons')!=='0';
}
function shareURL(){
  const u=new URL(location.href);u.search='';u.searchParams.set('team',JSON.stringify(team()));
  for(const [key,id] of [['cut','cut-v2'],['coverage','coverage-v2'],['mdef','mdef-v2'],['mamp','mamp-v2'],
    ['magicAps','magic-aps'],['magicChance','magic-chance'],['magicFlat','magic-flat'],['magicMax','magic-max'],
    ['magicCurrent','magic-current'],['magicLost','magic-lost'],['finishInterval','finish-interval'],
    ['finishChance','finish-chance'],['finishFlat','finish-flat'],['finishMax','finish-max'],
    ['finishCurrent','finish-current'],['finishLost','finish-lost']])u.searchParams.set(key,$(id).value);
  u.searchParams.set('finishMode',$('finish-mode').value);u.searchParams.set('finishType',$('finish-type').value);
  u.searchParams.set('red',$('red-v2').checked?'1':'0');u.searchParams.set('resource',$('resource-v2').checked?'1':'0');
  u.searchParams.set('summons',$('summons-v2').checked?'1':'0');history.replaceState(null,'',u);return u.href;
}
async function main(){
  try{const response=await fetch('./data.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    data=await response.json();restore();renderMobs();render();
    $('add-unit').addEventListener('click',()=>addRow({code:'MAGIC_CUSTOM'}));
    document.querySelector('.v2-controls').addEventListener('input',schedule);
    $('share-v2').addEventListener('click',async()=>{const href=shareURL();try{await navigator.clipboard.writeText(href);$('share-v2').firstChild.textContent='조합 링크 복사됨 ';}catch{$('share-v2').firstChild.textContent='주소창 링크를 복사하세요 ';}
      setTimeout(()=>$('share-v2').firstChild.textContent='현재 조합 링크 복사 ',2200);});
  }catch(error){$('v2-verdict').textContent='데이터를 불러오지 못했습니다';$('v2-verdict-detail').textContent=String(error.message??error);}
}
main();
