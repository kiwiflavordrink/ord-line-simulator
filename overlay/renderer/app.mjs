// Overlay page (수정내역 34). Runs inside the Electron window (window.ordApi from preload.js) or in a plain browser
// (folder/file inputs) for testing. No calculation here: worker.mjs calls dist/advisor.mjs.
import {parseHelperText,snapshotFromValue,goalId} from './logparse.mjs';
import {handFromUnits,reverseRawcode} from '../../dist/planner.mjs';
import {PERSONAL_QUESTS} from '../../dist/coach.mjs';

const api=window.ordApi??null;
const $=id=>document.getElementById(id);
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
// 수정내역 79: simulation workers, one per difficulty, so the three results come in parallel (~0.5 s each).
const simWorkers=[0,1,2].map(()=>new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}));
for(const w of simWorkers)w.onmessage=e=>{
  const m=e.data;if(m.type!=='stat'||m.id!==state.reqId)return;
  if(m.key){   // a candidate from 목표 후보 / 추천 상위
    const x=state.simJobs?.get(m.key);if(!x)return;x.sim=m.stat??null;
    if(state.upper?.includes(x))state.upper.sort(upperScore);
    clearTimeout(state.candTimer);state.candTimer=setTimeout(()=>{renderNext();renderUpper();},40);return;
  }
  if(!state.quick||state.quick.id!==m.id)return;
  state.quick.stats[m.difficulty]=m.stat;renderQuick();renderLack();requestCoach();exportView();
};

const state={settings:{},hand:{},meta:{},names:new Map(),tiers:new Map(),outputs:[],helper:null,
  frames:[],frame:0,reqId:0,quick:null,next:null,codeNames:new Map()};

// --- settings (Electron file, else localStorage) ------------------------------------------------------------------
async function loadSettings(){
  if(api)return api.getSettings();
  try{return JSON.parse(localStorage.getItem('ordsim-overlay')??'{}');}catch{return {};}
}
async function saveSettings(patch){
  state.settings={...state.settings,...patch};
  if(api)await api.setSettings(patch);
  else try{localStorage.setItem('ordsim-overlay',JSON.stringify(state.settings));}catch{}
}

// --- names ---------------------------------------------------------------------------------------------------------
const nameOf=id=>state.names.get(id)??state.codeNames.get(id)??id;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const chips=obj=>'<span class="chips">'+Object.entries(obj).map(([id,n])=>`<span>${esc(nameOf(id))}${n>1?'×'+n:''}</span>`).join('')+'</span>';

// --- helper data -----------------------------------------------------------------------------------------------------
function pickRecipeFile(names){
  const list=names.filter(n=>/^map-recipes-\d+\.json$/.test(n)).sort((a,b)=>+b.match(/\d+/)[0]- +a.match(/\d+/)[0]);
  return list[0]??null;
}
async function loadHelperFrom(readByName,names){
  const rec=pickRecipeFile(names);
  const read=async n=>names.includes(n)?JSON.parse(await readByName(n)):null;
  const [recipes,catalog,samples]=await Promise.all([rec?read(rec):null,read('tmo-unit-catalog.json'),read('tmo-clear-samples.json')]);
  applyHelper({recipes,catalog,samples,recipeFile:rec});
}
function applyHelper({recipes,catalog,samples,recipeFile}){
  state.names=new Map((catalog?.units??[]).map(u=>[reverseRawcode(u.rawcode),u.name]));
  state.tiers=new Map((catalog?.units??[]).map(u=>[reverseRawcode(u.rawcode),u.tier]));
  const outs=new Set();for(const r of recipes?.recipes??[])for(const o of r.outputs??[])if(o.kind==='UNIT')outs.add(o.id);
  state.outputs=[...outs].filter(id=>/전설|히든|초월|불멸|영원|제한|신비|변화|왜곡|세라핌|해적선/.test(state.tiers.get(id)??''))
    .sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'ko'));
  state.helper={recipeFile,recipes:recipes?.recipes?.length??0,samples:(samples?.samples??samples??[]).length};
  worker.postMessage({type:'helper',recipes,catalog,samples});
  fillUnitLists();analyze();
}
async function loadHelperDir(dir){
  if(!api||!dir)return;
  const names=await api.listDir(dir);
  const sep=dir.includes('\\')?'\\':'/';
  await loadHelperFrom(n=>api.readFile(dir+sep+n),names);
}

function fillUnitLists(){
  const sel=$('goalSelect'),cur=state.meta.goal??state.settings.goal??'';
  sel.innerHTML='<option value="">(선택)</option>'+state.outputs.map(id=>`<option value="${id}">${esc(nameOf(id))} · ${esc(state.tiers.get(id)??'')}</option>`).join('');
  sel.value=cur;
  const all=new Set([...state.names.keys(),...state.codeNames.keys()]);
  $('unitList').innerHTML=[...all].map(id=>`<option value="${esc(nameOf(id))} (${id})">`).join('');
}

// --- inputs: manual, log, scenario ---------------------------------------------------------------------------------
function setSnapshot(snap,label,owner=0){
  if(!snap)return;
  state.hand=handFromUnits(snap.units,owner);
  state.meta={difficulty:snap.difficulty,round:snap.round,goal:snap.goal??state.settings.goal??null,gold:snap.gold,lumber:snap.lumber,label};
  if(snap.goal)$('goalSelect').value=snap.goal;
  analyze();
}
let logTimer=null;
async function readLog(){
  const f=state.settings.logFile;if(!api||!f)return;
  try{
    const snap=parseHelperText(await api.readFile(f,2_000_000));
    if(snap)setSnapshot(snap,'헬퍼 기록');else status('기록 파일에서 유닛 목록을 찾지 못했습니다');
  }catch(e){status('기록 파일을 읽지 못했습니다: '+e.message);}
}
// Live hand from game memory: main.js runs tools/memscan/memscan.ps1 -Watch, which rewrites a JSON file every few
// seconds ({Status, Time, Units:[{Rawcode(reversed), Count, Owner, Name}]}). Polled here (the file is replaced, not appended).
let liveTimer=null,liveFile=null,liveTime=null;
// Without the Electron app (tools/overlay-web/serve.ps1 on localhost): the same live file is served at /hand.
const webLive=!api&&location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname);
async function startMemory(){
  stopMemory();
  if(webLive){liveFile='/hand';liveTime=null;liveTimer=setInterval(readLive,250);readLive();return;}
  const r=await api.memStart(+state.settings.memPlayer||0);
  if(r.error){status(r.error);return;}
  liveFile=r.file;liveTime=null;
  liveTimer=setInterval(readLive,250);readLive();
}
function stopMemory(){clearInterval(liveTimer);liveTimer=null;liveFile=null;api?.memStop();}
async function readLive(){
  let text;
  if(webLive){try{const r=await fetch('/hand',{cache:'no-store'});if(!r.ok)return;text=await r.text();}catch{status('패 읽기 서버에 연결하지 못했습니다');return;}}
  else{if(!liveFile||!(await api.exists(liveFile)))return;text=await api.readFile(liveFile);}
  let j;try{j=JSON.parse(text.replace(/^\uFEFF/,''));}catch{return;}
  if(j.Time===liveTime)return;liveTime=j.Time;
  // 수정내역 66: redraw only when the hand itself changed (memscan rewrites the file every few seconds).
  const sig=(j.Units??[]).map(u=>u.Rawcode+':'+u.Count+':'+u.Owner).sort().join('|')+'#'+String(j.Status??'').replace(/\s*\d+ms$/,'');
  if(sig===state.liveSig)return;state.liveSig=sig;
  for(const u of j.Units??[]){const code=reverseRawcode(u.Rawcode),n=String(u.Name??'').replace(/\|c[0-9a-fA-F]{8}|\|r/g,'').replace(/ - .*$/,'').trim();
    if(n&&!state.names.has(code)&&!state.codeNames.has(code))state.codeNames.set(code,n);}
  const owner=+state.settings.memPlayer||0;
  setSnapshot({units:j.Units??[],difficulty:null,round:null,goal:null},`게임 메모리 (${j.Status??'-'})`,owner);
}

function loadScenario(json){
  state.frames=json?.Frames??json?.frames??[];
  $('frame').innerHTML=state.frames.map((f,i)=>`<option value="${i}">${i+1}. ${esc(f.Name??f.Id)}</option>`).join('');
  showFrame(Math.min(state.settings.frame??0,state.frames.length-1));
}
function showFrame(i){
  if(!state.frames.length)return;
  state.frame=Math.max(0,Math.min(i,state.frames.length-1));$('frame').value=state.frame;
  saveSettings({frame:state.frame});
  const f=state.frames[state.frame];
  setSnapshot(snapshotFromValue(f)??{units:[],difficulty:f.Difficulty,round:f.Round,goal:goalId(f.GoalUnitId)},'시나리오');
}

function applySource(){
  const src=state.settings.source??'manual';
  $('source').value=src;
  for(const el of document.querySelectorAll('[data-for]'))el.hidden=el.dataset.for!==src;
  $('scenarioBar').hidden=src!=='scenario';
  if(api&&state.settings.logFile)api.unwatch(state.settings.logFile);
  if(src!=='memory'&&liveTimer)stopMemory();
  if(src==='memory'){if(api||webLive)startMemory();else status('게임 자동 읽기는 오버레이 앱이나 원랜디오버레이.bat에서만 됩니다.');}
  if(src==='log'&&api&&state.settings.logFile){api.watch(state.settings.logFile);readLog();}
  if(src==='manual'){state.hand={...(state.settings.manualHand??{})};state.meta={label:'직접 입력',goal:state.settings.goal??null};analyze();}
  if(src==='scenario'&&api&&state.settings.scenarioFile)api.readFile(state.settings.scenarioFile).then(t=>loadScenario(JSON.parse(t))).catch(e=>status(e.message));
}

// --- analysis ------------------------------------------------------------------------------------------------------
let analyzeTimer=null;
function analyze(){
  clearTimeout(analyzeTimer);
  analyzeTimer=setTimeout(()=>{
    const diff=difficulty();
    worker.postMessage({type:'analyze',id:++state.reqId,hand:state.hand,difficulty:diff,view:view(),
      goal:$('goalSelect').value||null,growthCut:+state.settings.growthCut||0,gorosei:state.settings.gorosei||null,cats:state.settings.cats??['legend','upper']});
    for(const id of ['nextBody','upperBody'])if(!$(id).dataset.filled)$(id).innerHTML='<span class="muted">계산 중…</span>';
    renderHand();
  },30);
}
const difficulty=()=>{const d=state.settings.difficulty??'auto';return d==='auto'?(['신','악몽','지옥'].includes(state.meta.difficulty)?state.meta.difficulty:'신'):d;};

worker.onmessage=e=>{
  const m=e.data;
  if(m.type==='error'){status('계산 오류: '+m.message);return;}
  if(m.type==='helper-ok'){status();return;}
  if(m.id!==state.reqId)return;
  if(m.type==='coach'){if(m.id===state.reqId){state.coach=m.warnings;renderCoach();}return;}
  if(m.type==='quick'){
    // Keep the numbers of the same team while the new ones are computed (no flicker); start the simulations.
    const same=state.quick&&JSON.stringify(state.quick.team)===JSON.stringify(m.team)&&state.quick.red===m.red;
    m.stats=same?{...state.quick.stats}:{};state.quick=m;renderQuick();renderLack();status();requestCoach();exportView();
    const d0=difficulty(),order=[d0,...['신','악몽','지옥'].filter(d=>d!==d0)];
    if(m.team.length)order.forEach((d,k)=>simWorkers[k].postMessage({type:'sim',id:m.id,team:m.team,red:m.red,growthCut:+state.settings.growthCut||0,difficulty:d}));
  }
  if(m.type==='next'){
    state.next=m.next;state.now=m.now;state.upper=m.upper;state.guide=m.guide;renderNext();renderNow();renderUpper();
    // 수정내역 79: simulate each candidate on the worker pool (after the difficulty runs already queued there).
    state.simJobs=new Map();let k=0;
    for(const x of [...(m.upper??[]),...(m.next??[]).flatMap(g=>g.list)]){
      if(!x.code){x.sim=null;continue;}
      const key='c'+k;state.simJobs.set(key,x);
      simWorkers[k++%simWorkers.length].postMessage({type:'sim',id:m.id,key,team:x.team,red:state.quick?.red??false,growthCut:+state.settings.growthCut||0,difficulty:difficulty()});
    }
  }
};

// --- coach (수정내역 85) -------------------------------------------------------------------------------------------
let coachTimer=null;
function requestCoach(){
  clearTimeout(coachTimer);
  coachTimer=setTimeout(()=>{
    const q=state.quick;if(!q)return;const st=state.settings;
    const num=v=>v===''||v==null||isNaN(+v)?null:+v;
    worker.postMessage({type:'coach',id:state.reqId,ctx:{myTeam:q.team,team:q.team.concat(state.others??[]),difficulty:difficulty(),
      gorosei:st.gorosei||null,players:+(st.sitPlayers??1),round:num(st.sitRound),storyStage:num(st.sitStage),stats:q.stats,red:q.red,
      quests:(st.sitQuests??[]).filter(Boolean),hand:state.hand,
      // 수정내역 87: 난이도가 측정됐을 때(직접 선택 또는 기록·자동 읽기)만 신·악몽 스토리 경고를 켠다.
      difficultyKnown:(st.difficulty&&st.difficulty!=='auto')||['신','악몽','지옥'].includes(state.meta.difficulty)}});
  },60);
}
function renderCoach(){
  const w=state.coach??[];
  $('coachBody').innerHTML=w.length?w.map(x=>`<div class="w ${x.level}">${esc(x.text)}${x.detail?`<small>${esc(x.detail)}</small>`:''}</div>`).join('')
    :'<div class="muted small">지금 경고 없음 · 라운드와 남은 스토리 단계를 넣으면 35라·에그헤드·보스를 미리 알려 줍니다.</div>';
  exportView();
}
function status(msg){
  const m=state.meta,parts=[m.label??'직접 입력'];
  if(m.round)parts.push(m.round+'라');
  parts.push(difficulty());
  if(!state.helper)parts.push('헬퍼 Data 없음');
  $('status').textContent=msg??parts.join(' · ');
}

function renderQuick(){
  const q=state.quick,diff=difficulty();
  // goal
  const g=q.goalPlan;
  if(!g)$('goalBody').innerHTML=`<span class="muted">${state.helper?'목표 유닛을 고르세요.':'헬퍼 Data 폴더(레시피)가 필요합니다.'}</span>`;
  else{
    const p=g.plan,lum=state.meta.lumber,gold=state.meta.gold;
    const miss=Object.keys(p.missing).length,owned=state.hand[g.id]??0;
    $('goalBody').innerHTML=owned?`<span class="ok big">보유 중</span> ${esc(nameOf(g.id))}${owned>1?' ×'+owned:''} · 다른 목표를 고르거나 아래 후보를 누르세요.`:`
      <div>${p.ok?'<span class="ok big">지금 제작 가능</span>':`<span class="big">${p.wisps}</span> 흔함 선택 위습`}
        ${p.wood?` · 나무 <b class="${lum!=null&&lum<p.wood?'bad':''}">${p.wood}</b>${lum!=null?` (보유 ${lum})`:''}`:''}
        ${p.gold?` · 골드 <b class="${gold!=null&&gold<p.gold?'bad':''}">${p.gold}</b>${gold!=null?` (보유 ${gold})`:''}`:''}</div>
      ${p.wisps?`<div>위습으로 뽑을 흔함: ${chips(p.commons)}</div>`:''}
      ${miss?`<div class="warn">특수 기물·못 뽑는 재료: ${specialChips(p.missing)}</div>`:''}
      ${p.special.length?`<div class="warn">특수 조건: ${p.special.map(s=>esc(s.kind+(s.id?' '+nameOf(s.id):''))).join(', ')}</div>`:''}
      ${Object.keys(p.used).length?`<div class="muted">쓰는 보유 유닛: ${chips(p.used)}</div>`:''}
      ${stagesHtml(g.stages)}`;
  }
  // combo
  if(!q.team.length)$('comboBody').innerHTML='<span class="muted">라인에 쓰는 상위 유닛이 없습니다.</span>';
  else{
    const rows=['신','악몽','지옥'].map(d=>{const s=q.stats[d];if(!s)return `<tr${d===diff?' class="cur"':''}><td>${d}${d===diff?' ◀':''}</td><td class="num muted">…</td><td class="num muted">…</td><td class="muted">계산 중</td></tr>`;
      return `<tr${d===diff?' class="cur"':''}><td>${d}${d===diff?' ◀':''}</td><td class="num">${s.remaining}</td><td class="num">${s.threshold}</td>
        <td class="${s.clear?'ok':'bad'}">${s.clear?'클리어':`${s.failedRound}라 ${Math.round(s.failedSecond??0)}초 패배`}</td></tr>`;}).join('');
    const c=q.ctrl;
    $('comboBody').innerHTML=`
      <div>${chips(Object.fromEntries(q.team.map(t=>[q.raws[t.code]??t.code,t.count])))}${q.red?' <span class="chips"><span>레드포스호</span></span>':''}</div>
      <table><tr><th>난이도</th><th class="num">남은 몹</th><th class="num">패배 기준</th><th>결과</th></tr>${rows}</table>
      <div>방깎 ${c.armorCut}${+state.settings.growthCut?` + 성장 ${state.settings.growthCut}`:''} · 이감 ${Math.round(c.slow*100)}% · 스턴 지수 ${c.stun.toFixed(2)}</div>
      ${q.unknown.length?`<div class="muted">시뮬 미지원 ${q.unknown.length}종: ${chips(Object.fromEntries(q.unknown.map(r=>[r,state.hand[r]])))}</div>`:''}
      <div class="muted">시뮬은 실제 신 클리어보다 평균 8마리 정도 비관적입니다.</div>`;
  }
  // real clears
  const r=q.similar;
  if(!r)$('realBody').innerHTML='<span class="muted">헬퍼 Data 폴더(tmo-clear-samples.json)가 필요합니다.</span>';
  else if(!r.count)$('realBody').innerHTML=`<span class="muted">${diff} 클리어 기록 중 겹치는 상위 유닛이 없습니다.</span>`;
  else{
    const a=r.remaining,qt=f=>a[Math.min(a.length-1,Math.floor(a.length*f))];
    const sim=q.stats[diff]?.remaining;
    $('realBody').innerHTML=`
      <div>상위 유닛이 가장 많이 겹치는 ${diff} 클리어 ${r.count}판(최종 덱): 남은 몹 중앙값 <b class="big">${r.median}</b> (하위 25% ${qt(.25)} · 상위 25% ${qt(.75)} · 최대 ${a.at(-1)})${sim!=null?` · 시뮬 ${sim}`:''}</div>
      <div class="muted">예: ${r.examples.slice(0,3).map(x=>`[${x.n}] `+x.units.slice(0,6).map(nameOf).map(esc).join('·')).join('<br>')}</div>`;
  }
}

const tierShort=id=>(state.tiers.get(id)??'').replace(/\s*\[.*\]/,'');
// 수정내역 66: one plain row per unit — name, how many 선택 위습, which commons to pick, wood, what cannot be picked.
const wispBadge=n=>`<span class="wisp${n?'':' zero'}">${n?`위습 ${n}`:'바로'}</span>`;
// 수정내역 79: special pieces (해적선·레일리(희귀)·토큰·초월쿠마 …) are named with their grade so they stand out.
const specialChips=obj=>'<span class="chips">'+Object.entries(obj).map(([id,n])=>`<span class="sp">${esc(nameOf(id))}${n>1?'×'+n:''} <small>${esc(tierShort(id)||'특수')}</small></span>`).join('')+'</span>';
// Craft order by stage: 위습 → 안흔함 → 희귀 → … each "name ×n (materials)".
function stagesHtml(st){
  if(!st)return '';
  const out=[];
  if(Object.keys(st.commons).length)out.push(`<div class="stage"><b>1. 위습으로 흔함</b> ${chips(st.commons)}</div>`);
  st.stages.forEach((g,k)=>out.push(`<div class="stage"><b>${k+(Object.keys(st.commons).length?2:1)}. ${esc(g.tier)}</b> `+
    g.items.map(x=>`${esc(nameOf(x.id))}${x.count>1?' ×'+x.count:''} <span class="muted small">(${x.materials.map(m=>esc(nameOf(m.id))+(m.count>1?'×'+m.count:'')).join('+')})</span>`).join(', ')+'</div>'));
  return out.length?'<div class="stages">'+out.join('')+'</div>':'';
}
const stageLine=st=>st?.stages?.length?`<span class="muted small">만들기 </span>`+st.stages.map(g=>`${esc(g.tier)} ${g.items.reduce((a,x)=>a+x.count,0)}`).join(' → '):'';
function howTo(p,st){
  const parts=[];
  if(p.wisps)parts.push(`흔함 뽑기 ${chips(p.commons)}`);
  if(p.wood)parts.push(`<span class="muted">나무 ${p.wood}</span>`);
  if(p.gold)parts.push(`<span class="muted">골드 ${p.gold}</span>`);
  if(Object.keys(p.missing).length)parts.push(`<span class="warn">특수 기물 ${specialChips(p.missing)}</span>`);
  if(st)parts.push(stageLine(st));
  return parts.filter(Boolean).join(' · ')||'<span class="ok">재료 다 있음</span>';
}
const unitRow=(x,extra='')=>`<div class="row click${x.id===$('goalSelect').value?' cur':''}" data-goal="${x.id}"><div class="top"><span><span class="name">${esc(nameOf(x.id))}</span> <span class="muted small">${esc(tierShort(x.id))}</span></span>
  <span>${extra} ${wispBadge(x.plan.wisps)}</span></div><div class="how">${howTo(x.plan,x.stages)}</div></div>`;
function fill(id,html){$(id).innerHTML=html;$(id).dataset.filled='1';exportView();}
// 수정내역 68: the visible tab as plain rows for the native window (tools/overlay-native/native.ps1), sent to /view.
const native=webLive&&new URLSearchParams(location.search).get('native')==='1';
let exportTimer=null;
function exportView(){
  if(!native)return;clearTimeout(exportTimer);
  exportTimer=setTimeout(()=>{
    const rows=(state.coach??[]).map(x=>({t:x.text,c:x.level==='red'?'bad':x.level==='yellow'?'warn':'ok',b:true})),colorOf=el=>el.closest?.('.bad')||el.querySelector?.('.bad')?'bad':el.querySelector?.('.warn')||el.classList?.contains('warn')?'warn':el.querySelector?.('.ok:not(.wisp)')?'ok':'';
    for(const sec of document.querySelectorAll('section[data-view]')){
      if(sec.hidden)continue;
      rows.push({t:[...(sec.querySelector('h2')?.childNodes??[])].filter(n=>n.nodeName!=='SELECT').map(n=>n.textContent).join('').replace(/\s+/g,' ').trim(),c:'acc',b:true});
      if(sec.id==='next'){
        const on=new Set(state.settings.cats??['legend','upper']);
        const cats=[...$('catBar').querySelectorAll('input')].map(i=>(on.has(i.value)?'☑ ':'☐ ')+i.parentElement.innerText.trim());
        [...$('catBar').querySelectorAll('input')].forEach((inp,k)=>rows.push({t:cats[k],c:on.has(inp.value)?'ok':'muted',a:'cat '+inp.value,i:1}));
      }
      if(sec.id==='lack'){const d=state.settings.difficulty??'auto';rows.push({t:`난이도: ${d==='auto'?'자동('+difficulty()+')':d}  ▶ 눌러서 바꾸기`,c:'acc',a:'diff',i:1});}
      if(sec.id==='goal'){const g=$('goalSelect').value;rows.push({t:'목표: '+(g?nameOf(g):'(목록에서 유닛을 누르면 목표로 지정)'),c:g?'':'muted'});
        if(g)rows.push({t:'✕ 목표 해제',c:'muted',a:'goal none',i:1});
        for(const d of $('goalBody').children.length?[...$('goalBody').children].flatMap(x=>x.classList.contains('stages')?[...x.children]:[x]):[$('goalBody')]){const t=d.innerText.replace(/\s+/g,' ').trim();if(t)rows.push({t,c:d.classList.contains('warn')?'warn':d.classList.contains('muted')?'muted':'',i:1});}
        continue;}
      const body=sec.querySelector('[id$=Body]')??sec;
      const items=body.querySelectorAll(':scope > .row, :scope > div.muted, :scope ul.lack > li, :scope .hand-row, :scope table tr');
      if(!items.length){const t=body.innerText.trim();if(t)rows.push({t,c:'muted'});continue;}
      for(const el of items){
        if(el.classList.contains('row')){
          const top=el.querySelector('.top')?.innerText.replace(/\s+/g,' ').trim()??el.innerText;
          rows.push({t:top,b:true,c:colorOf(el.querySelector('.top')??el),a:el.dataset.goal?'goal '+el.dataset.goal:''});
          for(const h of el.querySelectorAll('.how')){const t=h.innerText.replace(/\s+/g,' ').trim();if(t)rows.push({t,c:h.querySelector('.warn')?'warn':'muted',i:1});}
        }else rows.push({t:el.innerText.replace(/\s+/g,' ').trim(),c:colorOf(el)});
      }
    }
    fetch('/view',{method:'POST',body:JSON.stringify({view:view(),status:$('status').textContent,rows})}).catch(()=>{});
  },30);
}
function renderNext(){
  if(state.next==null&&state.helper)return;
  if(!state.helper){fill('nextBody','<span class="muted">헬퍼 Data 폴더(레시피)가 필요합니다.</span>');return;}
  const html=(state.next??[]).map(g=>!g.list?.length?'':`<div class="muted small">${esc(g.label)}</div>`+g.list.map(x=>unitRow(x,simText(x.sim))).join('')).join('');
  fill('nextBody',html||'<span class="muted">후보 없음 (위 칸에서 종류를 고르세요)</span>');
}
function renderNow(){
  const list=state.now??[];
  if(!state.helper){fill('nowBody','<span class="muted">헬퍼 Data 폴더(레시피)가 필요합니다.</span>');return;}
  fill('nowBody',list.length?list.map(x=>`<div class="row click" data-goal="${x.id}"><div class="top"><span><span class="name ok">${esc(nameOf(x.id))}</span> <span class="muted small">${esc(tierShort(x.id))}</span></span>
      <span>${x.plan.wood?`나무 ${x.plan.wood} `:''}${x.plan.gold?`골드 ${x.plan.gold}`:''}</span></div><div class="how"><span class="muted small">재료</span> ${chips(x.plan.used)}</div></div>`).join('')
    :'<span class="muted">지금 바로 만들 수 있는 유닛이 없습니다. "목표 후보"에서 위습으로 가까운 유닛을 보세요.</span>');
}
const upperScore=(a,b)=>{const sc=x=>x.sim===undefined?2e6:!x.sim?1e6:x.sim.clear?x.sim.remaining:1000-(x.sim.failedRound??60)*10-(x.sim.failedSecond??0)/10;return sc(a)-sc(b)||a.plan.wisps-b.plan.wisps;};
const simText=s=>s===undefined?'<span class="muted small">시뮬 계산 중…</span>':!s?'<span class="muted small">시뮬 미지원</span>':s.clear?`<span class="ok small">${difficulty()} 클리어 · 남은 몹 ${s.remaining}</span>`:`<span class="bad small">${difficulty()} ${s.failedRound}라 패배</span>`;
// 수정내역 83: 가이드 — the nearest targets by 흔함 price (특수 기물 included) with how much the hand covers, role,
// real-clear partners, what the team still lacks after making it, and 겹침패 (targets that need the same 희귀·전설급
// material or 특수 기물).
const nameTier=id=>`${esc(nameOf(id))}<span class="muted small">·${esc(tierShort(id))}</span>`;
function guideRow(x){
  if(x.locked)return `<div class="row"><div class="top"><span><span class="name muted">${esc(nameOf(x.id))}</span> <span class="muted small">${esc(tierShort(x.id))}</span></span><span class="bad small">잠김</span></div>
    <div class="how muted">한 판에 하나뿐인 기물(초월 위습·그린블러드·유니크 아이템)을 이미 썼습니다.</div></div>`;
  const pct=Math.round(x.pct*100),lines=[];
  if(x.role.length)lines.push(`<span class="muted small">역할</span> ${esc(x.role.join(' · '))}`);
  const pr=x.partners;
  if(pr?.games)lines.push(`<span class="muted small">어울림</span> ${pr.list.map(p=>`${nameTier(p.id)} ${Math.round(p.share*100)}%`).join(', ')} <span class="muted small">(실전 ${pr.games}판, 남은 몹 중앙값 ${pr.median})</span>`);
  if(x.gaps.length)lines.push(`<span class="muted small">보완</span> <span class="warn">${esc(x.gaps.join(' · '))}</span>`);
  if(x.overlaps.length)lines.push(`<span class="muted small">겹침</span> ${x.overlaps.map(o=>`${nameTier(o.id)}(${o.shared.map(nameTier).join('+')})`).join(', ')}`);
  if(x.specials.length)lines.push(`<span class="muted small">특수 기물</span> ${x.specials.map(s=>`<span class="chips"><span class="sp">${esc(nameOf(s.id))} 흔함 ${Math.round(s.price)}</span></span>`).join(' ')}`);
  return `<div class="row click${x.id===$('goalSelect').value?' cur':''}" data-goal="${x.id}"><div class="top"><span><span class="name">${esc(nameOf(x.id))}</span> <span class="muted small">${esc(tierShort(x.id))}</span></span>
    <span><b class="${pct>=70?'ok':''}">${pct}%</b> <span class="muted small">남은 흔함 ${Math.round(x.price)}/${Math.round(x.full)}</span></span></div>
    ${lines.map(l=>`<div class="how">${l}</div>`).join('')}${x.stages?`<div class="how">${stageLine(x.stages)}</div>`:''}</div>`;
}
function renderUpper(){
  if(!state.helper){fill('upperBody','<span class="muted">헬퍼 Data 폴더(레시피)가 필요합니다.</span>');return;}
  if(state.guide==null)return;
  const g=state.guide;
  fill('upperBody',g.groups.map(gr=>`<div class="muted small">${esc(gr.label)}</div>`+(gr.list.length?gr.list.map(guideRow).join(''):'<span class="muted">없음</span>')).join('')+
    `<div class="muted small">가격 = 들어가는 흔함 수 (전설 평균 ${Math.round(g.L)}). 특수 기물은 흔함 환산값.</div>`);
}
// 부족한 것: what the current combination lacks, from the line simulation and simple role counts.
const ROLE={single:['L9','L16','L31','H13','H19','T1','L6','H5','D6','TR7'],finish:['L36'],
  special:['H17','L26','L3','D2','SR4','I8','L10'],deleter:['OB1','L12','D4','L19'],mana:['D2','L19','L28','TR22','MY8','SP2','L31']};
function renderLack(){
  const q=state.quick;if(!q){fill('lackBody','-');return;}
  const codes=new Map(q.team.map(t=>[t.code,t.count]));const has=r=>ROLE[r].reduce((a,c)=>a+(codes.get(c)??0),0);
  const s=q.stats[difficulty()],items=[];
  if(!q.team.length)items.push('라인에 쓰는 상위 유닛이 없습니다.');
  else{
    if(!s)items.push('<span class="muted">시뮬 계산 중…</span>');
    if(s&&!s.clear)items.push(`<b class="bad">${difficulty()}에서 ${s.failedRound}라 ${Math.round(s.failedSecond??0)}초 패배</b> (시뮬) — 라인딜이 부족합니다.`);
    else if(s)items.push(`<b class="ok">${difficulty()} 클리어</b> (시뮬, 남은 몹 ${s.remaining} / 패배 ${s.threshold}).`);
    const n1=has('single'),n2=has('finish'),n3=has('special'),n4=has('deleter');
    items.push(n1?`단일 ${n1}기`:'<span class="warn">단일 없음</span> — 루치·상디·코비 전설 등으로 새 몹에 단일을 묻히면 라인딜이 크게 오릅니다 (루치 1기 ≈ 모든 몹 13%/라운드).');
    if(n1)items.push(n2?`끝딜 ${n2}기`:'<span class="warn">끝딜 없음</span> — 핸콕 전설 1기 ≈ 모든 몹 5%/라운드, 단일과 같이 쓰면 더 큼.');
    items.push(n3?`보스·광폭 처리 ${n3}기`:'<span class="warn">보스·광폭 처리 없음</span> — 아카이누 히든, 제파·네코 전설, 코알라 왜곡 중 하나가 있으면 루치 1~2기를 아낍니다.');
    items.push(n4?`삭제 ${n4}기`:'<span class="muted">삭제(도움소 흡수 등) 없음</span>');
  }
  fill('lackBody','<ul class="lack">'+items.map(x=>`<li>${x}</li>`).join('')+'</ul>');
}

function renderHand(){
  const ids=Object.keys(state.hand).filter(id=>state.hand[id]>0).sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'ko'));
  $('handBody').innerHTML=ids.length?ids.map(id=>`<div class="hand-row"><span>${esc(nameOf(id))} <span class="muted">${esc(state.tiers.get(id)??'')} ${id}</span></span>
    <span class="n"><button data-d="-1" data-id="${id}">−</button>${state.hand[id]}<button data-d="1" data-id="${id}">＋</button></span></div>`).join('')
    :'<span class="muted">비어 있음</span>';
}
function editHand(id,d){
  state.hand[id]=Math.max(0,(state.hand[id]??0)+d);if(!state.hand[id])delete state.hand[id];
  if((state.settings.source??'manual')==='manual')saveSettings({manualHand:state.hand});
  analyze();
}

// --- view tabs and font (수정내역 66) ------------------------------------------------------------------------------
const view=()=>state.settings.view??'now';
function applyView(){
  const v=view();
  for(const b of $('tabs').querySelectorAll('button'))b.classList.toggle('on',b.dataset.view===v);
  // 수정내역 81: the goal card stays on top in every tab once a goal is chosen (click a unit in any list to set it).
  const goal=$('goalSelect').value;
  for(const sec of document.querySelectorAll('section[data-view]'))sec.hidden=sec.id==='goal'?!(goal||v==='next'):sec.dataset.view!==v;
  exportView();
}
$('tabs').onclick=async e=>{const b=e.target.closest('button[data-view]');if(!b)return;await saveSettings({view:b.dataset.view});applyView();analyze();};
// 수정내역 67: hotkeys from topmost.ps1 (F2 next tab, F3 click mode) arrive through /cmd.
const VIEWS=['now','next','upper','lack','hand'];let lastCmd=null;
if(webLive)setInterval(async()=>{
  let t;try{t=(await (await fetch('/cmd',{cache:'no-store'})).text()).trim();}catch{return;}
  if(lastCmd===null){lastCmd=t;return;}if(!t||t===lastCmd)return;lastCmd=t;
  if(t.startsWith('tab ')){const i=VIEWS.indexOf(view());await saveSettings({view:VIEWS[(i+1)%VIEWS.length]});applyView();analyze();}
  // 수정내역 68: commands from the native window: "<seq> view <v>", "<seq> goal <id>", "<seq> cat <c>".
  const [,verb,arg]=t.split(' ');
  if(verb==='view'&&VIEWS.includes(arg)){await saveSettings({view:arg});applyView();analyze();}
  if(verb==='goal'&&arg){await setGoal(arg==='none'?null:arg);}
  if(verb==='diff'){const L=['auto','신','악몽','지옥'],i=L.indexOf(state.settings.difficulty??'auto');await saveSettings({difficulty:L[(i+1)%L.length]});$('difficulty').value=state.settings.difficulty;status();analyze();}
  if(verb==='cat'&&arg){const on=new Set(state.settings.cats??['legend','upper']);on.has(arg)?on.delete(arg):on.add(arg);await saveSettings({cats:[...on]});syncCats();analyze();}
  exportView();
  if(t.startsWith('mode ')){const click=t.endsWith('click');document.body.classList.toggle('clickable',click);status(click?'클릭 가능 모드 (F3: 통과)':'클릭 통과 모드 (F3: 클릭 가능)');setTimeout(()=>status(),2500);}
},400);
const applyFont=()=>document.documentElement.style.setProperty('--fs',(state.settings.fontSize??15)+'px');
$('fontUp').onclick=async()=>{await saveSettings({fontSize:Math.min(24,(state.settings.fontSize??15)+1)});applyFont();};
$('fontDown').onclick=async()=>{await saveSettings({fontSize:Math.max(10,(state.settings.fontSize??15)-1)});applyFont();};

// --- events --------------------------------------------------------------------------------------------------------
$('btnSettings').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('btnCompact').onclick=()=>{
  // Web overlay (수정내역 65): fold to the header bar; topmost.ps1 shrinks the window to match.
  if(webLive){const f=document.body.classList.toggle('folded');fetch('/ui?fold='+(f?1:0),{cache:'no-store'}).catch(()=>{});return;}
  document.body.classList.toggle('compact');
};
$('btnClick').onclick=()=>api?.setClickThrough(true);
$('btnQuit').onclick=()=>api?api.quit():window.close();
$('source').onchange=async e=>{await saveSettings({source:e.target.value});applySource();};
$('memPlayer').onchange=async e=>{await saveSettings({memPlayer:+e.target.value});if((state.settings.source??'manual')==='memory')startMemory();};
$('difficulty').onchange=async e=>{await saveSettings({difficulty:e.target.value});analyze();status();};
$('growthCut').onchange=async e=>{await saveSettings({growthCut:+e.target.value||0});analyze();};
$('gorosei').onchange=async e=>{await saveSettings({gorosei:e.target.value||null});analyze();};
// 개인 퀘스트 3칸 (수정내역 86): 자동 읽기 전까지 직접 고른다. 도박 퀘스트는 목록에 두되 조언하지 않는다.
for(const [k,sel] of [...document.querySelectorAll('.sitQuest')].entries()){
  sel.innerHTML='<option value="">-</option>'+PERSONAL_QUESTS.map(q=>`<option value="${q.id}">${q.name}</option>`).join('');
  sel.onchange=async()=>{await saveSettings({sitQuests:[...document.querySelectorAll('.sitQuest')].map(x=>x.value)});requestCoach();};
}
for(const [id,key] of [['sitRound','sitRound'],['sitStage','sitStage'],['sitPlayers','sitPlayers']])
  $(id).onchange=async e=>{await saveSettings({[key]:e.target.value});requestCoach();};
async function setGoal(id){
  $('goalSelect').value=id??'';await saveSettings({goal:id||null});state.meta.goal=id||null;
  applyView();analyze();window.scrollTo({top:0,behavior:'smooth'});
}
$('goalSelect').onchange=e=>setGoal(e.target.value||null);
$('goalClear').onclick=()=>setGoal(null);
// 목표 종류 (수정내역 49): saved in settings; default 전설 + 상위.
function syncCats(){const on=new Set(state.settings.cats??['legend','upper']);for(const c of $('catBar').querySelectorAll('input'))c.checked=on.has(c.value);}
$('catBar').onchange=async()=>{await saveSettings({cats:[...$('catBar').querySelectorAll('input:checked')].map(c=>c.value)});analyze();};
$('nowBody').onclick=$('upperBody').onclick=$('nextBody').onclick=e=>{const g=e.target.closest('[data-goal]')?.dataset.goal;if(g)setGoal(g);};
$('handBody').onclick=e=>{const b=e.target.closest('button[data-id]');if(b)editHand(b.dataset.id,+b.dataset.d);};
$('addUnit').onclick=()=>{
  const v=$('unitSearch').value.trim();if(!v)return;
  const code=v.match(/\(([A-Za-z0-9]{4})\)$/)?.[1]??[...state.names,...state.codeNames].find(([,n])=>n===v)?.[0]??(/^[A-Za-z0-9]{4}$/.test(v)?v:null);
  if(!code){status('유닛을 찾지 못했습니다: '+v);return;}
  editHand(code,1);$('unitSearch').value='';
};
$('unitSearch').onkeydown=e=>{if(e.key==='Enter')$('addUnit').onclick();};
$('clearHand').onclick=()=>{state.hand={};if((state.settings.source??'manual')==='manual')saveSettings({manualHand:{}});analyze();};
$('prevFrame').onclick=()=>showFrame(state.frame-1);
$('nextFrame').onclick=()=>showFrame(state.frame+1);
$('frame').onchange=e=>showFrame(+e.target.value);

$('pickHelper').onclick=async()=>{
  if(!api){$('helperFiles').click();return;}
  const dir=await api.pickFolder('ORD_JHelper Data 폴더');if(!dir)return;
  await saveSettings({helperDir:dir});$('helperDir').textContent=dir;loadHelperDir(dir);
};
$('helperFiles').onchange=async e=>{
  const files=[...e.target.files],byName=new Map(files.map(f=>[f.name,f]));
  $('helperDir').textContent=files[0]?.webkitRelativePath?.split('/')[0]??'-';
  await loadHelperFrom(n=>byName.get(n).text(),[...byName.keys()]);
};
$('pickLog').onclick=async()=>{
  if(!api)return;const f=await api.pickFile('헬퍼 기록 파일 (recommendation-samples.jsonl 등)');if(!f)return;
  await saveSettings({logFile:f});$('logFile').textContent=f;applySource();
};
$('pickScenario').onclick=async()=>{
  if(!api){$('scenarioInput').click();return;}
  const f=await api.pickFile('시나리오 (Simulation/default-scenario.json)');if(!f)return;
  await saveSettings({scenarioFile:f});$('scenarioFile').textContent=f;applySource();
};
$('scenarioInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;$('scenarioFile').textContent=f.name;loadScenario(JSON.parse(await f.text()));};
api?.onFileChanged(f=>{if(f===state.settings.logFile){clearTimeout(logTimer);logTimer=setTimeout(readLog,300);}});
api?.onMemLog?.(t=>{const el=$('memLog');if(el)el.textContent=t.split(/\r?\n/).at(-1);});
api?.onMode(m=>document.body.classList.toggle('through',m.clickThrough));
api?.onToggleCompact(()=>document.body.classList.toggle('compact'));

// --- start ---------------------------------------------------------------------------------------------------------
(async()=>{
  state.settings=await loadSettings();
  if(new URLSearchParams(location.search).get('src')==='memory'&&!state.settings.source)await saveSettings({source:'memory'});
  const data=await (await fetch(new URL('../../dist/data.json',import.meta.url))).json();
  for(const h of data.heroes)for(const f of h.forms)if(f.rawcode&&!state.codeNames.has(f.rawcode))state.codeNames.set(f.rawcode,h.name);
  worker.postMessage({type:'data',data});
  for(const w of simWorkers)w.postMessage({type:'data',data});
  $('difficulty').value=state.settings.difficulty??'auto';
  $('growthCut').value=state.settings.growthCut??0;
  $('gorosei').value=state.settings.gorosei??'';
  [...document.querySelectorAll('.sitQuest')].forEach((x,k)=>x.value=(state.settings.sitQuests??[])[k]??'');
  $('sitRound').value=state.settings.sitRound??'';$('sitStage').value=state.settings.sitStage??'';$('sitPlayers').value=state.settings.sitPlayers??'1';
  $('memPlayer').value=String(state.settings.memPlayer??0);
  syncCats();applyView();applyFont();
  $('helperDir').textContent=state.settings.helperDir??'-';
  $('logFile').textContent=state.settings.logFile??'-';
  $('scenarioFile').textContent=state.settings.scenarioFile??'-';
  fillUnitLists();
  if(state.settings.helperDir)await loadHelperDir(state.settings.helperDir).catch(e=>status('헬퍼 Data를 읽지 못했습니다: '+e.message));
  else if(webLive){
    // serve.ps1 found the ORD_JHelper Data folder on this PC (수정내역 48): load it from /helper/.
    try{const r=await fetch('/helper/',{cache:'no-store'});const j=r.ok?await r.json():null;
      if(j?.names?.length){$('helperDir').textContent=j.dir;await loadHelperFrom(n=>fetch('/helper/'+encodeURIComponent(n),{cache:'no-store'}).then(x=>x.text()),j.names);}}
    catch(e){status('헬퍼 Data를 찾지 못했습니다');}
  }
  applySource();
  if(!state.settings.helperDir&&!state.settings.source)$('settings').hidden=false;
  status();
})();
