#!/usr/bin/env node
// ordsim: run 원랜디 60–65라 line and 65라 single-target scenarios from JSON.
// Usage: node cli/ordsim.mjs [scenario.json | -] [--compact] [--timeline]
//        node cli/ordsim.mjs --list-units
// Exit codes: 0 success, 1 engine error, 2 input/usage error.
import {readFileSync} from 'node:fs';
import {loadData,validateScenario,runScenario,supportedUnits,TOOL} from './scenario.mjs';

const USAGE=`사용법: node cli/ordsim.mjs <시나리오.json | -> [--compact] [--timeline]
       node cli/ordsim.mjs --list-units
  파일 대신 '-'를 주거나 파이프로 넣으면 표준입력에서 JSON을 읽습니다.
  --compact    한 줄 JSON으로 출력
  --timeline   1초 단위 생존 몹 수(timeline)를 결과에 포함
  --list-units 지원 유닛·효과 코드 목록 출력
자세한 형식: docs/CLI.md`;

function emit(obj,compact){process.stdout.write(JSON.stringify(obj,null,compact?0:2)+'\n');}
function fail(exitCode,errorType,errors,compact,warnings=[]){
  emit({ok:false,tool:TOOL,errorType,errors,warnings},compact);
  for(const e of errors)process.stderr.write(`오류${e.path?` [${e.path}]`:''}: ${e.message}\n`);
  process.exitCode=exitCode;
}

const args=process.argv.slice(2);
const flags=new Set(args.filter(a=>a.startsWith('--')));
const positional=args.filter(a=>!a.startsWith('--'));
const compact=flags.has('--compact');
const known=['--compact','--timeline','--list-units','--help'];

if(flags.has('--help')){process.stdout.write(USAGE+'\n');}
else if([...flags].some(f=>!known.includes(f))){
  fail(2,'usage',[...flags].filter(f=>!known.includes(f)).map(f=>({path:'',code:'UNKNOWN_FLAG',message:`알 수 없는 옵션 ${f}\n${USAGE}`})),compact);
}else if(positional.length>1){
  fail(2,'usage',[{path:'',code:'TOO_MANY_ARGS',message:`시나리오는 하나만 지정할 수 있습니다.\n${USAGE}`}],compact);
}else{
  const loaded=loadData();
  if(flags.has('--list-units'))emit({ok:true,tool:TOOL,...supportedUnits(loaded.data)},compact);
  else{
    const source=positional[0]??'-';
    let text;
    if(source==='-'&&process.stdin.isTTY){
      fail(2,'usage',[{path:'',code:'NO_INPUT',message:`시나리오 파일 경로 또는 표준입력 JSON이 필요합니다.\n${USAGE}`}],compact);
    }else{
      try{text=readFileSync(source==='-'?0:source,'utf8');}
      catch(e){fail(2,'input',[{path:'',code:'READ_FAILED',message:`입력을 읽지 못했습니다: ${e.message}`}],compact);}
    }
    if(text!==undefined){
      let raw;
      try{raw=JSON.parse(text.replace(/^﻿/,''));}
      catch(e){fail(2,'input',[{path:'',code:'INVALID_JSON',message:`JSON 형식 오류: ${e.message}`}],compact);}
      if(raw!==undefined){
        const {errors,warnings,scenario}=validateScenario(raw,loaded.data);
        if(errors.length)fail(2,'input',errors,compact,warnings);
        else{
          if(flags.has('--timeline'))scenario.output.timeline=true;
          try{emit(runScenario(scenario,loaded,warnings),compact);}
          catch(e){fail(1,'engine',[{path:'',code:'ENGINE_ERROR',message:e.message}],compact,warnings);}
        }
      }
    }
  }
}
