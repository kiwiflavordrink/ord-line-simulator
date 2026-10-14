const $=id=>document.getElementById(id);
const format=n=>n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
function addFile(container,file){
  const row=document.createElement('div');row.className='resource-row';
  const detail=document.createElement('div');
  const title=document.createElement('strong');title.textContent=file.name;detail.appendChild(title);
  const meta=document.createElement('small');meta.textContent=`${file.type} · ${format(file.bytes)}`;detail.appendChild(meta);
  row.appendChild(detail);
  const link=document.createElement('a');link.href=`./resources/files/${file.id}`;link.download=file.name;link.textContent='받기 ↓';link.setAttribute('aria-label',`${file.name} 다운로드`);row.appendChild(link);
  container.appendChild(row);
}
try{
  const response=await fetch('./resources/manifest.json');if(!response.ok)throw Error(`HTTP ${response.status}`);
  const files=await response.json();$('file-count').textContent=String(files.length);
  for(const file of files)addFile($(file.type==='엑셀'?'xlsx-list':'notes-list'),file);
}catch(error){$('file-count').textContent='—';$('xlsx-list').textContent=`목록을 불러오지 못했습니다: ${error.message}`;}
