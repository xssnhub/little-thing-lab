import {test} from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync,spawn} from 'node:child_process';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'little-thing-test-'));
 for(const d of ['src','scripts'])fs.cpSync(new URL('../'+d,import.meta.url),path.join(root,d),{recursive:true});
 fs.mkdirSync(root+'/runtime');fs.mkdirSync(root+'/records');fs.mkdirSync(root+'/dist/assets',{recursive:true});
 const now=Date.now();fs.writeFileSync(root+'/runtime/permit.json',JSON.stringify({id:'fixture',authorized:true,remainingPercent:[80],startedAt:now,observedAt:now}));return root;}
test('an existing writer prevents another batch without altering the lock',()=>{
 const root=fixture();try{fs.mkdirSync(root+'/runtime/writer.lock');fs.writeFileSync(root+'/runtime/writer.lock/owner.json','existing');
 const r=spawnSync(process.execPath,['scripts/run.mjs'],{cwd:root});assert.notEqual(r.status,0);
 assert.equal(fs.readFileSync(root+'/runtime/writer.lock/owner.json','utf8'),'existing');assert.deepEqual(fs.readdirSync(root+'/records'),[]);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('STOP produces a stopped receipt and releases the lock',()=>{
 const root=fixture();try{fs.writeFileSync(root+'/runtime/STOP','');const r=spawnSync(process.execPath,['scripts/run.mjs'],{cwd:root});
 assert.notEqual(r.status,0);assert.equal(JSON.parse(fs.readFileSync(root+'/records/fixture/batch.json')).status,'stopped');assert.ok(!fs.existsSync(root+'/runtime/writer.lock'));
 }finally{fs.rmSync(root,{recursive:true});}
});
test('SIGINT during a run preserves a recoverable state',async()=>{
 const root=fixture();try{
 const child=spawn(process.execPath,['scripts/run.mjs'],{cwd:root,stdio:'ignore'});
 const code=await new Promise((resolve,reject)=>{const timer=setInterval(()=>{if(fs.existsSync(root+'/runtime/writer.lock/owner.json')){clearInterval(timer);setTimeout(()=>child.kill('SIGINT'),80);}},10);
 child.on('error',reject);child.on('exit',c=>{clearInterval(timer);resolve(c);});});
 assert.notEqual(code,0);const b=JSON.parse(fs.readFileSync(root+'/records/fixture/batch.json'));assert.equal(b.status,'stopped');
 assert.ok(b.runs.length>=1);const saved=JSON.parse(fs.readFileSync(root+'/records/fixture/'+b.runs.at(-1).id+'.json'));assert.ok(saved.tick>=0);assert.equal(saved.stopReason,'user_stop');assert.ok(!fs.existsSync(root+'/runtime/writer.lock'));
 }finally{fs.rmSync(root,{recursive:true});}
});
