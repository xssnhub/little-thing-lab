import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {create,advance,metrics} from '../src/life.mjs';
const directory='records/batch-001',batch=JSON.parse(fs.readFileSync(directory+'/batch.json'));
assert.equal(batch.status,'complete');assert.equal(batch.runs.length,6);
const hashes=JSON.parse(fs.readFileSync(directory+'/hashes.json'));
for(const [file,hash]of Object.entries(hashes))assert.equal(createHash('sha256').update(fs.readFileSync(directory+'/'+file)).digest('hex'),hash);
for(const run of batch.runs){
 const saved=JSON.parse(fs.readFileSync(directory+'/'+run.id+'.json'));
 assert.deepEqual(advance(create(run.seed,run.mode),saved.tick),saved,run.id+' deterministic rerun');
 assert.deepEqual(metrics(saved),run.final);
 const resumed=advance(JSON.parse(JSON.stringify(saved)),100);
 const direct=advance(create(run.seed,run.mode),saved.tick+100);
 assert.deepEqual(resumed,direct,run.id+' resumed in fresh process');
}
const exported=JSON.parse(fs.readFileSync('dist/assets/experiment.json'));
assert.deepEqual(exported.runs,batch.runs);assert.equal(exported.id,batch.id);
const expected=['index.html','app.js','style.css','favicon.svg','assets/experiment.json','assets/observations.json',
 'assets/specimen-1.svg','assets/specimen-2.svg','assets/specimen-3.svg'];
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(dir+'/'+d.name,prefix+d.name+'/'):[prefix+d.name]);}
assert.deepEqual(files('dist').sort(),expected.sort(),'public allowlist');
for(const file of files('dist'))assert.ok(!/gho_|sk-proj-|accountId|remainingPercent|permit\.json/.test(fs.readFileSync('dist/'+file,'utf8')),'private runtime material in '+file);
assert.ok(!fs.existsSync('runtime/writer.lock'),'writer lock released');
console.log(JSON.stringify({status:'passed',runs:6,hashes:Object.keys(hashes).length,resumeChecks:6,publicFiles:expected.length,
 note:'Fresh-process deterministic replay and resume; not a second model handoff.'}));
