import {simulate,SUPPORTS} from './engine.mjs';

const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0}).format(n);
const state={data:null,pending:false};
const url=new URL(location.href);
const params=url.searchParams;

function populate(data){
  const select=$('hero');
  const groups=new Map();
  for(const hero of data.heroes){
    if(!groups.has(hero.grade)){
      const group=document.createElement('optgroup');group.label=hero.grade;
      select.appendChild(group);groups.set(hero.grade,group);
    }
    const option=document.createElement('option');option.value=hero.code;option.textContent=hero.name;
    groups.get(hero.grade).appendChild(option);
  }
  const requested=params.get('hero');
  select.value=data.heroes.some(h=>h.code===requested)?requested:'TR19';
  for(const id of ['support','extra']){
    const sel=$(id);
    const none=document.createElement('option');none.value='';none.textContent='선택 안 함';sel.appendChild(none);
    for(const [code,profile] of Object.entries(SUPPORTS)){
      const option=document.createElement('option');option.value=code;option.textContent=profile.name;
      sel.appendChild(option);
    }
    const requestedCode=params.get(id);
    sel.value=SUPPORTS[requestedCode]?requestedCode:'';
  }
  $('support-damage').checked=params.get('supportDamage')!=='0';
  $('support-ab').checked=params.get('supportAb')!=='0';
  $('extra-ab').checked=params.get('extraAb')!=='0';
  const cut=Number(params.get('cut'));
  if(Number.isFinite(cut)&&cut>=20&&cut<=300)$('cut').value=$('cut-number').value=cut;
  const coverage=Number(params.get('coverage'));
  if(Number.isFinite(coverage)&&coverage>=10&&coverage<=100)$('coverage').value=coverage;
  $('resource').checked=params.get('resource')!=='0';
  $('summons').checked=params.get('summons')!=='0';
  $('red-damage').checked=params.get('redDamage')!=='0';
  $('hero-count').textContent=data.heroes.length+'명';
}

function currentOptions(){
  return {cut:Number($('cut').value),coverage:Number($('coverage').value)/100,
          fullResource:$('resource').checked,summons:$('summons').checked,
          redDamage:$('red-damage').checked,
          supportCode:$('support').value,extraCode:$('extra').value,
          supportDamage:$('support-damage').checked,supportAb:$('support-ab').checked,
          extraAb:$('extra-ab').checked};
}

function renderChart(result){
  const svg=$('chart'),w=800,h=260,l=34,r=16,t=13,b=30;
  const x=sec=>l+sec/192*(w-l-r),y=count=>h-b-count/60*(h-t-b);
  const grid=[0,20,40,55].map(v=>`<g><line x1="${l}" y1="${y(v)}" x2="${w-r}" y2="${y(v)}" stroke="${v===55?'#a55255':'#294253'}" stroke-width="1" stroke-dasharray="${v===55?'5 5':'0'}"/><text x="${l-9}" y="${y(v)+4}" text-anchor="end" fill="#8ea6b7" font-size="11">${v}</text></g>`).join('');
  const rounds=[60,61,62,63,64,65].map((v,i)=>`<g><line x1="${x(i*32)}" y1="${t}" x2="${x(i*32)}" y2="${h-b}" stroke="#294253" stroke-width="1"/><text x="${x(i*32+16)}" y="${h-8}" text-anchor="middle" fill="#8ea6b7" font-size="11">${v}라</text></g>`).join('');
  const pts=result.timeline.map(p=>`${x(p.second).toFixed(2)},${y(p.count).toFixed(2)}`).join(' ');
  const color=result.clear?'#66d5b1':'#f07470';
  const last=result.timeline.at(-1);
  const marker=last?`<circle cx="${x(last.second)}" cy="${y(last.count)}" r="4.5" fill="${color}"/>`:'';
  svg.innerHTML=`<title>60~65라 생존 몹 수</title><desc>패배 기준 55기. 입력 조건에서 라운드가 이어지는 동안의 몹 수를 표시합니다.</desc>${grid}${rounds}<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>${marker}`;
  svg.setAttribute('aria-label',`생존 몹 수 그래프. ${result.clear?`65라 종료 ${result.remaining}기 생존`:`${result.failedRound}라 ${result.failedSecond}초에 55기 도달`}`);
}

function renderTable(result){
  const body=$('round-rows');body.innerHTML='';
  for(const q of result.checkpoints){
    const tr=document.createElement('tr');
    const cells=[`${q.round}라`,`${fmt(q.remaining)}기`,`${fmt(q.priorRoundRemaining)}기`,
                 `${fmt(q.currentRoundRemaining)}기`,q.specialKillSecond==null?'—':`${q.specialKillSecond.toFixed(1)}초`];
    for(let i=0;i<cells.length;i++){
      const td=document.createElement('td');td.textContent=cells[i];
      if(i===2&&q.priorRoundRemaining===0&&q.round>60)td.className='prior';
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  if(!result.clear){
    const tr=document.createElement('tr');
    const td=document.createElement('td');td.colSpan=5;
    td.textContent=`${result.failedRound}라 ${result.failedSecond.toFixed(1)}초에 55기 도달 — 이후 라운드는 계산하지 않았습니다.`;
    td.style.color='var(--danger)';tr.appendChild(td);body.appendChild(tr);
  }
}

function render(){
  if(!state.data)return;
  const hero=state.data.heroes.find(h=>h.code===$('hero').value);
  if(!hero)return;
  const options=currentOptions();
  $('coverage-value').textContent=Math.round(options.coverage*100)+'%';
  $('hero-meta').innerHTML='';
  const tags=[hero.grade,hero.focus];
  const splash=hero.forms[0].splash;
  tags.push(splash?`평타 스플래시 ${Math.round(splash*100)}% · ${hero.forms[0].splash_radius}범위`:'스킬 범위 피해');
  if(hero.forms.length>1)tags.push('변신/추가 형태');
  for(const label of tags){const s=document.createElement('span');s.className='tag';s.textContent=label;$('hero-meta').appendChild(s);}
  $('hero-source').href=hero.url;
  const result=simulate(state.data,hero.code,options);
  $('verdict-label').textContent=result.clear?'55기 미만 유지':'패배 기준 도달';
  $('verdict-label').classList.toggle('failed',!result.clear);
  $('verdict').textContent=result.clear?'65라 종료까지 유지':`${result.failedRound}라에서 한계 도달`;
  $('verdict-detail').textContent=result.clear?
    `65라 종료 시 ${result.remaining}기 생존. 이전 라운드 몹은 다음 라운드에서도 계속 피격했습니다.`:
    `${result.failedRound}라 ${result.failedSecond.toFixed(1)}초에 필드 몹 55기. 이후 라운드는 진행되지 않습니다.`;
  $('remaining').textContent=fmt(result.remaining);
  $('spawned').textContent=`라인 ${fmt(result.totalLineSpawned)}기 출현`;
  $('summary-cut').textContent=fmt(options.cut);
  $('summary-coverage').textContent=Math.round(options.coverage*100)+'%';
  $('summary-ab').textContent=result.averageAb.toFixed(1);
  renderChart(result);renderTable(result);
  state.result=result;
}

function schedule(){
  if(state.pending)return;state.pending=true;
  requestAnimationFrame(()=>{state.pending=false;render();});
}

function updateURL(){
  const u=new URL(location.href);
  u.searchParams.set('hero',$('hero').value);
  u.searchParams.set('cut',$('cut').value);
  u.searchParams.set('coverage',$('coverage').value);
  u.searchParams.set('resource',$('resource').checked?'1':'0');
  u.searchParams.set('summons',$('summons').checked?'1':'0');
  u.searchParams.set('redDamage',$('red-damage').checked?'1':'0');
  u.searchParams.set('support',$('support').value);
  u.searchParams.set('extra',$('extra').value);
  u.searchParams.set('supportDamage',$('support-damage').checked?'1':'0');
  u.searchParams.set('supportAb',$('support-ab').checked?'1':'0');
  u.searchParams.set('extraAb',$('extra-ab').checked?'1':'0');
  history.replaceState(null,'',u);
  return u.href;
}

async function main(){
  try{
    const response=await fetch('./data.json');
    if(!response.ok)throw new Error(`데이터 HTTP ${response.status}`);
    state.data=await response.json();
    populate(state.data);render();
    for(const id of ['hero','coverage','resource','summons','red-damage','support','extra','support-damage','support-ab','extra-ab'])$(id).addEventListener('input',schedule);
    $('cut').addEventListener('input',()=>{$('cut-number').value=$('cut').value;schedule();});
    $('cut-number').addEventListener('change',()=>{
      const v=Math.max(20,Math.min(300,Math.round(Number($('cut-number').value)||201)));
      $('cut').value=$('cut-number').value=v;schedule();
    });
    $('share').addEventListener('click',async()=>{
      const href=updateURL();
      try{await navigator.clipboard.writeText(href);$('share').firstChild.textContent='설정 링크 복사됨 ';}
      catch{$('share').firstChild.textContent='주소창의 링크를 복사하세요 ';}
      setTimeout(()=>$('share').firstChild.textContent='현재 설정 링크 복사 ',2200);
    });
  }catch(error){
    $('verdict').textContent='데이터를 불러오지 못했습니다';
    $('verdict-detail').textContent=String(error.message??error);
  }
}
main();
