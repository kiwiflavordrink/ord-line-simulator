import {createHash} from 'node:crypto';
import {mkdir,open,stat,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Prepare byte-for-byte downloadable copies. Never writes to the source maps.
const root=path.resolve(import.meta.dirname,'../..');
const out=path.join(root,'ordr-line-simulator','dist','resources','maps');
const chunkSize=20*1024*1024;
const sources=[
  {id:'s2-2305-cheat',name:'ORDR_S2_2.305_cheat.w3x',source:path.join(root,'work','ORDR_S2_2.305_cheat.w3x'),description:'2.305 치트 버전: 오브젝트·JASS 추출이 가능한 비교 기준'},
  {id:'s2-2323-original',name:'ORDR_S2_2.323[R].w3x',source:path.join(root,'work','ORDR_S2_2.323_R.w3x'),description:'사용자가 제공한 2.323 원본: 보호된 아카이브'}
];
await mkdir(out,{recursive:true});
const manifest=[];
for(const spec of sources){
  const size=(await stat(spec.source)).size;
  const fd=await open(spec.source,'r');
  const hash=createHash('sha256');
  const parts=[];
  try{
    for(let offset=0,index=0;offset<size;index++){
      const length=Math.min(chunkSize,size-offset);
      const buffer=Buffer.allocUnsafe(length);
      let filled=0;
      while(filled<length){const {bytesRead}=await fd.read(buffer,filled,length-filled,offset+filled);if(!bytesRead)throw Error(`Unexpected end of ${spec.name}`);filled+=bytesRead;}
      hash.update(buffer);
      const filename=`${spec.id}.part${String(index+1).padStart(2,'0')}`;
      await writeFile(path.join(out,filename),buffer);
      parts.push({filename,bytes:length,sha256:createHash('sha256').update(buffer).digest('hex')});
      offset+=length;
    }
  }finally{await fd.close();}
  manifest.push({id:spec.id,name:spec.name,description:spec.description,bytes:size,sha256:hash.digest('hex'),parts});
}
await writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
for(const file of manifest)console.log(`${file.name}: ${file.bytes} bytes, ${file.parts.length} parts, SHA-256 ${file.sha256}`);
