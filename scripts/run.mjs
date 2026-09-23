import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {create,step,frame,metrics,RULES} from '../src/life.mjs';
import {checkPermit} from './gate.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const permitPath='runtime/permit.json';
const permit=JSON.parse(fs.readFileSync(permitPath,'utf8'));checkPermit(permit);
const id=permit.id;
if(!/^[a-z0-9-]+$/.test(id)) throw Error('Invalid batch id');
const directory=`records/${id}`;
if(fs.existsSync(directory)) throw Error('本批已存在，禁止覆蓋或重用放行');
fs.mkdirSync('runtime',{recursive:true});
// Exclusive filesystem lock. On a crash, inspect PID before removing this directory.
fs.mkdirSync('runtime/writer.lock');
fs.writeFileSync('runtime/writer.lock/owner.json',JSON.stringify({pid:process.pid,startedAt:Date.now(),batch:id}));
let stopped=false;process.on('SIGINT',()=>stopped=true);process.on('SIGTERM',()=>stopped=true);
const save=(p,data)=>{fs.writeFileSync(p+'.part',JSON.stringify(data));fs.renameSync(p+'.part',p);};
const result={id,question:'食物集中或分散，會如何影響群聚與存活？',createdAt:new Date().toISOString(),
  rules:RULES,seeds:[17,83,211],maxTicks:2400,sampleEvery:40,conditions:['uniform','patchy'],
  status:'running',runs:[],stopReason:null};
try {
  fs.mkdirSync(directory);
  for(const seed of result.seeds) for(const mode of result.conditions) {
    checkPermit(JSON.parse(fs.readFileSync(permitPath,'utf8')));
    if(stopped||fs.existsSync('runtime/STOP')) throw Error('收到停止指令');
    const s=create(seed,mode),frames=[frame(s)];
    for(let tick=0;tick<result.maxTicks&&!s.stopReason;tick++) {
      if(tick%200===0) {
        await new Promise(resolve=>setImmediate(resolve));
        try {checkPermit(JSON.parse(fs.readFileSync(permitPath,'utf8')));}
        catch(e){s.stopReason='resource_stop';result.stopReason=e.message;break;}
        if(stopped||fs.existsSync('runtime/STOP')) {s.stopReason='user_stop';break;}
      }
      step(s);if(s.tick%40===0)frames.push(frame(s));
    }
    if(frames.at(-1).tick!==s.tick)frames.push(frame(s));
    const name=`${mode}-${seed}`;
    save(`${directory}/${name}.json`,s);
    result.runs.push({id:name,seed,mode,stopReason:s.stopReason||'tick_limit',final:metrics(s),frames});
    save(`${directory}/batch.json`,result);
    console.log(JSON.stringify({run:name,...metrics(s),stopReason:s.stopReason||'tick_limit'}));
    if(s.stopReason==='user_stop')throw Error('收到停止指令');
    if(s.stopReason==='resource_stop')throw Error(result.stopReason);
  }
  result.status='complete';result.stopReason='planned_comparisons_complete';
} catch(e) {result.status='stopped';result.stopReason=e.message;process.exitCode=1;}
finally {
  result.finishedAt=new Date().toISOString();save(`${directory}/batch.json`,result);
  fs.rmSync('runtime/writer.lock',{recursive:true});
}
if(result.status==='complete') {
  const summary=result.runs.map(({frames,...r})=>r);
  save(`${directory}/summary.json`,{...result,runs:summary});
  // Explicit public projection: simulated data only. Never copy records wholesale.
  save('dist/assets/experiment.json',{id:result.id,question:result.question,createdAt:result.createdAt,
    finishedAt:result.finishedAt,maxTicks:result.maxTicks,rulesVersion:RULES.version,runs:result.runs});
  console.log('Batch complete; public replay exported.');
}
