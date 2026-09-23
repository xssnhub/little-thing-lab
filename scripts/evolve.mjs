import fs from 'node:fs';
import path from 'node:path';
import {createWorld,applyIntervention,advance,metrics} from '../src/world.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
process.chdir(root);

const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const writeJSON=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');};
const clone=v=>JSON.parse(JSON.stringify(v));

let world;
if(fs.existsSync('state/current.json')) world=readJSON('state/current.json');
else world=createWorld(230923);

world.appliedDirectives ||= [];
const directive=readJSON('control/directive.json');
const beforeWorld=clone(world);
const before=metrics(world);
const fromTick=world.tick;
const eventIndex=world.timeline.length;

if(directive?.id && !world.appliedDirectives.includes(directive.id)){
  applyIntervention(world,directive);
  world.appliedDirectives.push(directive.id);
  if(world.appliedDirectives.length>40) world.appliedDirectives=world.appliedDirectives.slice(-40);
}

const ticks=Math.max(0,Math.min(12000,Math.floor(directive?.ticks ?? 900)));
advance(world,ticks);

const after=metrics(world);
const finishedAt=new Date().toISOString();
const run={
  id:directive?.id ?? `run-${world.tick}`,
  finishedAt,
  fromTick,
  toTick:world.tick,
  ticks:world.tick-fromTick,
  directive:{
    type:directive?.type ?? 'observe',
    note:directive?.note ?? '',
    question:directive?.question ?? ''
  },
  before:{
    population:before.population,
    generation:before.maxGeneration,
    settlements:before.settlements,
    dominantSymbol:before.dominantSymbol
  },
  after:{
    population:after.population,
    generation:after.maxGeneration,
    settlements:after.settlements,
    dominantSymbol:after.dominantSymbol
  },
  events:world.timeline.slice(eventIndex).slice(-12)
};

const runs=fs.existsSync('history/runs.json')?readJSON('history/runs.json'):[];
if(!runs.some(x=>x.id===run.id))runs.push(run);
while(runs.length>80)runs.shift();

writeJSON('state/current.json',world);
writeJSON('history/timeline.json',world.timeline);
writeJSON('history/runs.json',runs);
writeJSON('dist/assets/world.json',world);
writeJSON('dist/assets/previous-world.json',beforeWorld);
writeJSON('dist/assets/directive.json',directive);
writeJSON('dist/assets/latest-run.json',run);
writeJSON('dist/assets/runs.json',runs.slice(-20));

const summary={
  updatedAt:finishedAt,
  tick:after.tick,
  population:after.population,
  generation:after.maxGeneration,
  settlements:after.settlements,
  dominantSymbol:after.dominantSymbol,
  dominantShare:after.dominantShare,
  latestEvent:world.timeline.at(-1) ?? null,
  latestRun:run.id
};
writeJSON('state/summary.json',summary);
writeJSON('dist/assets/summary.json',summary);

if(world.timeline.at(-1)?.tick===world.tick || world.tick%3600<Math.max(1,ticks)){
  fs.mkdirSync('history/snapshots',{recursive:true});
  writeJSON(`history/snapshots/tick-${String(world.tick).padStart(7,'0')}.json`,world);
}

console.log(JSON.stringify({summary,run},null,2));
