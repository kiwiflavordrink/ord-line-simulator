// Overlay page (수정내역 34). Runs inside the Electron window (window.ordApi from preload.js) or in a plain browser
// (folder/file inputs) for testing. No calculation here: worker.mjs calls dist/advisor.mjs.
import {parseHelperText,snapshotFromValue,goalId} from './logparse.mjs';
import {handFromUnits,reverseRawcode} from '../../dist/planner.mjs';

const api=window.ordApi??null;
const $=id=>document.getElementById(id);
const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});

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
async function startMemory(){
  stopMemory();
  const r=await api.memStart(+state.settings.memPlayer||0);
  if(r.error){status(r.error);return;}
  liveFile=r.file;liveTime=null;
  liveTimer=setInterval(readLive,2000);readLive();
}
function stopMemory(){clearInterval(liveTimer);liveTimer=null;liveFile=null;api?.memStop();}
async function readLive(){
  if(!liveFile||!(await api.exists(liveFile)))return;
  let j;try{j=JSON.parse((await api.readFile(liveFile)).replace(/^\uFEFF/,''));}catch{return;}
  if(j.Time===liveTime)return;liveTime=j.Time;
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
  if(src==='memory'){if(api)startMemory();else status('게임 자동 읽기는 오버레이 앱(Windows)에서만 됩니다.');}
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
    worker.postMessage({type:'analyze',id:++state.reqId,hand:state.hand,difficulty:diff,
      goal:$('goalSelect').value||null,growthCut:+state.settings.growthCut||0});
    $('nextBody').innerHTML='<span class="muted">계산 중…</span>';
    renderHand();
  },120);
}
const difficulty=()=>{const d=state.settings.difficulty??'auto';return d==='auto'?(['신','악몽','지옥'].includes(state.meta.difficulty)?state.meta.difficulty:'신'):d;};

worker.onmessage=e=>{
  const m=e.data;
  if(m.type==='error'){status('계산 오류: '+m.message);return;}
  if(m.type==='helper-ok'){status();return;}
  if(m.id!==state.reqId)return;
  if(m.type==='quick'){state.quick=m;renderQuick();status();}
  if(m.type==='next'){state.next=m.next;renderNext();}
};

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
      ${miss?`<div class="warn">부족 재료(위습으로 안 됨): ${chips(p.missing)}</div>`:''}
      ${p.special.length?`<div class="warn">특수 조건: ${p.special.map(s=>esc(s.kind+(s.id?' '+nameOf(s.id):''))).join(', ')}</div>`:''}
      ${Object.keys(p.used).length?`<div class="muted">쓰는 보유 유닛: ${chips(p.used)}</div>`:''}
      <div class="muted">순서: ${p.steps.map(s=>esc(nameOf(s.output))).join(' → ')||'-'}</div>`;
  }
  // combo
  if(!q.team.length)$('comboBody').innerHTML='<span class="muted">라인에 쓰는 상위 유닛이 없습니다.</span>';
  else{
    const rows=['신','악몽','지옥'].map(d=>{const s=q.stats[d];if(!s)return '';
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

function renderNext(){
  const list=state.next??[];
  if(!list.length){$('nextBody').innerHTML='<span class="muted">후보 없음</span>';return;}
  $('nextBody').innerHTML=`<table><tr><th>유닛</th><th class="num">위습</th><th class="num">나무</th><th>부족</th><th class="num">시뮬 남은</th></tr>`+
    list.map(x=>`<tr><td class="click" data-goal="${x.id}">${esc(nameOf(x.id))}</td><td class="num">${x.plan.wisps}</td><td class="num">${x.plan.wood||''}</td>
      <td>${Object.keys(x.plan.missing).length?chips(x.plan.missing):''}</td><td class="num ${x.sim?(x.sim.clear?'ok':'bad'):''}">${x.sim?.remaining??'-'}</td></tr>`).join('')+'</table>';
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

// --- events --------------------------------------------------------------------------------------------------------
$('btnSettings').onclick=()=>{$('settings').hidden=!$('settings').hidden;};
$('btnCompact').onclick=()=>document.body.classList.toggle('compact');
$('btnClick').onclick=()=>api?.setClickThrough(true);
$('btnQuit').onclick=()=>api?api.quit():window.close();
$('source').onchange=async e=>{await saveSettings({source:e.target.value});applySource();};
$('memPlayer').onchange=async e=>{await saveSettings({memPlayer:+e.target.value});if((state.settings.source??'manual')==='memory')startMemory();};
$('difficulty').onchange=async e=>{await saveSettings({difficulty:e.target.value});analyze();status();};
$('growthCut').onchange=async e=>{await saveSettings({growthCut:+e.target.value||0});analyze();};
$('goalSelect').onchange=async e=>{await saveSettings({goal:e.target.value||null});state.meta.goal=e.target.value||null;analyze();};
$('nextBody').onclick=e=>{const g=e.target.closest('[data-goal]')?.dataset.goal;if(g){$('goalSelect').value=g;$('goalSelect').onchange({target:$('goalSelect')});}};
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
  const data=await (await fetch(new URL('../../dist/data.json',import.meta.url))).json();
  for(const h of data.heroes)for(const f of h.forms)if(f.rawcode&&!state.codeNames.has(f.rawcode))state.codeNames.set(f.rawcode,h.name);
  worker.postMessage({type:'data',data});
  $('difficulty').value=state.settings.difficulty??'auto';
  $('growthCut').value=state.settings.growthCut??0;
  $('memPlayer').value=String(state.settings.memPlayer??0);
  $('helperDir').textContent=state.settings.helperDir??'-';
  $('logFile').textContent=state.settings.logFile??'-';
  $('scenarioFile').textContent=state.settings.scenarioFile??'-';
  fillUnitLists();
  if(state.settings.helperDir)await loadHelperDir(state.settings.helperDir).catch(e=>status('헬퍼 Data를 읽지 못했습니다: '+e.message));
  applySource();
  if(!state.settings.helperDir&&!state.settings.source)$('settings').hidden=false;
  status();
})();
