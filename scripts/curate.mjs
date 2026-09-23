import fs from 'node:fs';
import {createHash} from 'node:crypto';
const batch=JSON.parse(fs.readFileSync('records/batch-001/batch.json'));
const r=(mode,seed)=>batch.runs.find(r=>r.mode===mode&&r.seed===seed);
const avg=(mode,key)=>batch.runs.filter(r=>r.mode===mode).reduce((s,r)=>s+r.final[key],0)/3;
const notes={title:'更常靠近，不一定活得更多。',
 body:`三組實驗中，食物集中時的最終鄰近比例都較高：平均 ${Math.round(avg('patchy','clustered')*100)}%，分散時為 ${Math.round(avg('uniform','clustered')*100)}%。但最終存活數的配對差異是 +16、−11、0。這一輪支持「分布改變了聚集」，還不能證明群聚帶來存活優勢。`,
 specimens:[
 {seed:17,mode:'uniform',tick:0,title:'相同的起點',reason:'50 個體，同一組位置與特徵；只改變食物分布。'},
 {seed:83,mode:'patchy',tick:2400,title:'聚得更近，卻沒活得更多',reason:'鄰近比例 71%，高於對照的 41%；存活 69 個，少於對照的 80 個。'},
 {seed:17,mode:'uniform',tick:2400,title:'留下的只有一條血緣',reason:'58 個體已走到第 13 代，但都來自同一個起始祖先。'}]};
const colors=['#62ead3','#f9bb62','#a0bbff','#f48a99','#b4da86','#d1a6f2','#72c9ed','#f1dc9a'];
for(const [index,spec] of notes.specimens.entries()) {
 const run=r(spec.mode,spec.seed),f=run.frames.find(f=>f.tick===spec.tick);
 if(!f)throw Error('Missing specimen frame');
 let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"><rect width="960" height="600" fill="#081e26"/>';
 f.food.forEach((v,i)=>{if(v>.1)svg+=`<rect x="${i%40*24}" y="${Math.floor(i/40)*24}" width="24" height="24" fill="#5fc096" opacity="${Math.min(.44,v/16*.44).toFixed(3)}"/>`;});
 for(const p of f.agents)svg+=`<circle cx="${p[1]}" cy="${p[2]}" r="${(3.5+Math.min(3,p[4]/35)).toFixed(2)}" fill="${colors[p[6]%8]}"/><path d="M${p[1]} ${p[2]} l${(-Math.cos(p[3])*13).toFixed(2)} ${(-Math.sin(p[3])*13).toFixed(2)}" stroke="${colors[p[6]%8]}" opacity=".6"/>`;
 fs.writeFileSync(`dist/assets/specimen-${index+1}.svg`,svg+'</svg>');
}
fs.writeFileSync('dist/assets/observations.json',JSON.stringify(notes,null,2)+'\n');
const hashes={};for(const file of fs.readdirSync('records/batch-001').filter(f=>f.endsWith('.json')&&f!=='hashes.json'))
 hashes[file]=createHash('sha256').update(fs.readFileSync('records/batch-001/'+file)).digest('hex');
fs.writeFileSync('records/batch-001/hashes.json',JSON.stringify(hashes,null,2)+'\n');
console.log(JSON.stringify({meanClustered:{uniform:avg('uniform','clustered'),patchy:avg('patchy','clustered')},specimens:notes.specimens.length}));
