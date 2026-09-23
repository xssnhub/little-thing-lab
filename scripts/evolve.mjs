import fs from 'node:fs';
import path from 'node:path';
import {createWorld,applyIntervention,advance,metrics} from '../src/world.mjs';

const root=path.resolve(new URL('..',import.meta.url).pathname);
process.chdir(root);

const readJSON=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const writeJSON=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');};

let world;
if(fs.existsSync('state/current.json')) world=readJSON('state/current.json');
else world=createWorld(230923);

world.appliedDirectives ||= [];
const directive=readJSON('control/directive.json');
if(directive?.id && !world.appliedDirectives.includes(directive.id)){
  applyIntervention(world,directive);
  world.appliedDirectives.push(directive.id);
  if(world.appliedDirectives.length>40) world.appliedDirectives=world.appliedDirectives.slice(-40);
}

const ticks=Math.max(0,Math.min(12000,Math.floor(directive?.ticks ?? 900)));
advance(world,ticks);

writeJSON('state/current.json',world);
writeJSON('history/timeline.json',world.timeline);
writeJSON('dist/assets/world.json',world);
writeJSON('dist/assets/directive.json',directive);

const m=metrics(world);
const summary={
  updatedAt:new Date().toISOString(),
  tick:m.tick,
  population:m.population,
  generation:m.maxGeneration,
  settlements:m.settlements,
  dominantSymbol:m.dominantSymbol,
  dominantShare:m.dominantShare,
  latestEvent:world.timeline.at(-1) ?? null
};
writeJSON('state/summary.json',summary);
writeJSON('dist/assets/summary.json',summary);

if(world.timeline.at(-1)?.tick===world.tick || world.tick%3600<ticks){
  fs.mkdirSync('history/snapshots',{recursive:true});
  writeJSON(`history/snapshots/tick-${String(world.tick).padStart(7,'0')}.json`,world);
}

console.log(JSON.stringify(summary,null,2));
