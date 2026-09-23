import fs from 'node:fs';
import {createWorld,metrics} from '../src/world.mjs';

const required=[
  'README.md','AGENTS.md','STATUS.md','src/world.mjs',
  'history/timeline.json','control/directive.json',
  'dist/index.html','dist/app.js','dist/style.css','dist/world.js'
];
for(const p of required) if(!fs.existsSync(p)) throw Error(`missing ${p}`);

const world=fs.existsSync('state/current.json')
  ? JSON.parse(fs.readFileSync('state/current.json','utf8'))
  : createWorld(230923);
const m=metrics(world);
if(world.version!==2) throw Error('unexpected world version');
if(!Number.isFinite(m.tick)||!Number.isFinite(m.population)) throw Error('invalid world metrics');

if(fs.existsSync('dist/assets/world.json')){
  const publicWorld=JSON.parse(fs.readFileSync('dist/assets/world.json','utf8'));
  if(publicWorld.tick!==world.tick) throw Error('published world is not current');
}

console.log(JSON.stringify({ok:true,tick:m.tick,population:m.population,events:world.timeline.length}));
