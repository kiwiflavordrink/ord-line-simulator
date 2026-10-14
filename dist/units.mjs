import {SUPPORTS} from './engine.mjs';
import {CONDITIONAL_UNITS,DELETERS} from './engine_v3.mjs';

const $=id=>document.getElementById(id);
const params=new URL(location.href).searchParams;
let snapshot,modeled=new Set(),selected=null;

function node(tag,text,className){
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(className)el.className=className;
  return el;
}
function show(unit){
  selected=unit.code;
  const box=$('unit-detail');box.replaceChildren();
  const top=node('div',undefined,'unit-detail-head');
  const title=node('h2',`${unit.name} · ${unit.grade}`);top.appendChild(title);
  top.appendChild(node('span',unit.code,'unit-code'));box.appendChild(top);
  box.appendChild(node('p',unit.role||'역할군 미기재','unit-role'));
  const status=modeled.has(unit.code)?'조합 시뮬레이터에서 선택 가능 · 근사 모델':'툴팁 자료 등록 · 전투 계산 미구현';
  box.appendChild(node('p',status,'unit-model-status'));
  const links=node('div',undefined,'unit-actions');
  const source=node('a','ORDR 원문 ↗');source.href=unit.url;source.target='_blank';source.rel='noopener noreferrer';links.appendChild(source);
  if(modeled.has(unit.code)){
    const sim=node('a','시뮬레이터에서 선택 ↗');
    const url=new URL('./v3.html',location.href);url.searchParams.set('team',JSON.stringify([{code:unit.code,count:1}]));
    sim.href=url.href;links.appendChild(sim);
  }
  box.appendChild(links);
  const skills=(heading,lines)=>{
    if(!lines.length)return;
    box.appendChild(node('h3',heading));
    const list=node('div',undefined,'unit-skill-lines');
    for(const line of lines)list.appendChild(node('p',line));
    box.appendChild(list);
  };
  const info=(heading,items)=>skills(heading,items);
  const baseInfo=unit.base_info||{};
  info('조합 명령',baseInfo.commands||[]);
  info('재료 유닛',(baseInfo.recipe||[]).map(x=>`${x.name} [${x.code}]`));
  info('추가 재료',baseInfo.extra_requirements||[]);
  info('버프·디버프',baseInfo.buff_lines||[]);
  if(unit.has_tooltip){
    skills('기본 스킬',unit.base_lines);
    skills('특성강화 스킬',unit.trait_lines);
    const onInfo=unit.trait_info||{};
    if((onInfo.buff_lines||[]).length&&JSON.stringify(onInfo.buff_lines)!==JSON.stringify(baseInfo.buff_lines))
      info('특성강화 버프·디버프',onInfo.buff_lines);
  }else box.appendChild(node('p','ORDR 도감에 상세 스킬 설명이 없습니다.','help'));
  info('상위 조합',(baseInfo.higher_units||[]).map(x=>`${x.name} [${x.code}]`));
  box.appendChild(node('p',`툴팁 SHA-256: ${unit.tooltip_sha256}`,'unit-hash'));
  for(const item of $('unit-list').children)item.setAttribute('aria-selected',item.dataset.code===unit.code?'true':'false');
}
function render(){
  const query=$('unit-query').value.trim().toLocaleLowerCase('ko-KR');
  const grade=$('unit-grade').value,status=$('unit-status').value;
  const matches=snapshot.units.filter(unit=>(!grade||unit.grade===grade)&&
    (!query||`${unit.name} ${unit.code} ${unit.role}`.toLocaleLowerCase('ko-KR').includes(query))&&
    (!status||status==='tooltip'&&unit.has_tooltip||status==='simulated'&&modeled.has(unit.code)||
      status==='unmodeled'&&unit.has_tooltip&&!modeled.has(unit.code)));
  $('unit-result-count').textContent=`${matches.length}기 표시`;
  const list=$('unit-list');list.replaceChildren();
  for(const unit of matches){
    const item=node('button',`${unit.name} · ${unit.grade}${unit.has_tooltip?'':' · 설명 없음'}`,'unit-list-item');
    item.type='button';item.dataset.code=unit.code;item.setAttribute('role','option');
    item.setAttribute('aria-selected',unit.code===selected?'true':'false');
    item.addEventListener('click',()=>{show(unit);const url=new URL(location.href);url.searchParams.set('code',unit.code);history.replaceState(null,'',url);});
    list.appendChild(item);
  }
  if(!matches.some(unit=>unit.code===selected)){
    if(matches.length)show(matches[0]);else $('unit-detail').replaceChildren(node('p','검색 결과가 없습니다.','help'));
  }
}
async function main(){
  try{
    const [catalog,damageData]=await Promise.all([
      fetch('./ordr_units.json').then(r=>{if(!r.ok)throw new Error(`유닛 데이터 HTTP ${r.status}`);return r.json();}),
      fetch('./data.json').then(r=>{if(!r.ok)throw new Error(`계산 데이터 HTTP ${r.status}`);return r.json();})
    ]);
    snapshot=catalog;
    modeled=new Set([...damageData.heroes.map(h=>h.code),...Object.keys(CONDITIONAL_UNITS),
      ...Object.keys(SUPPORTS),...Object.keys(DELETERS)]);
    $('unit-count').textContent=String(snapshot.unit_count);
    $('tooltip-count').textContent=String(snapshot.tooltip_count);
    $('model-count').textContent=String(snapshot.units.filter(u=>modeled.has(u.code)).length);
    $('snapshot-time').textContent=`ORDR.kr 수집: ${new Date(snapshot.retrieved_at_utc).toLocaleString('ko-KR')} · 특성강화 ${snapshot.trait_count}기`;
    for(const grade of [...new Set(snapshot.units.map(u=>u.grade))]){
      const option=node('option',grade);option.value=grade;$('unit-grade').appendChild(option);
    }
    for(const id of ['unit-query','unit-grade','unit-status'])$(id).addEventListener('input',render);
    selected=params.get('code');render();
  }catch(error){$('snapshot-time').textContent=String(error.message??error);}
}
main();
