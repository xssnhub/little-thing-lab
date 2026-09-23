import {createWorld,step,metrics,applyIntervention} from './world.js';

const $=q=>document.querySelector(q);
const canvas=$('#world');
const ctx=canvas.getContext('2d');
const symbols=['△','○','∴','⋮','⌁','◇','⊙','∿'];
const palette=['#7ad7ca','#edc277','#91aee8','#e58b93','#a9d28c','#c7a0df','#70c2e3','#e4d396'];

let world=null;
let running=true;
let speed=1;
let lastRender=0;
let lastStep=0;
let lastDirectiveCheck=0;

function colorForSymbol(symbol){
  const i=Math.max(0,symbols.indexOf(symbol));
  return palette[i%palette.length];
}

function draw(){
  if(!world)return;
  ctx.fillStyle='#061518';
  ctx.fillRect(0,0,960,620);
  for(const r of world.resources){
    const alpha=.08+.26*Math.max(0,Math.min(1,r.level/r.capacity));
    const radius=18+30*(r.level/r.capacity);
    const g=ctx.createRadialGradient(r.x,r.y,2,r.x,r.y,radius);
    g.addColorStop(0,`rgba(122,215,202,${alpha+.11})`);
    g.addColorStop(1,'rgba(122,215,202,0)');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(r.x,r.y,radius,0,Math.PI*2);ctx.fill();
  }
  for(const m of world.marks.slice(-100)){
    ctx.globalAlpha=.16;ctx.strokeStyle=colorForSymbol(m.symbol);
    ctx.beginPath();ctx.arc(m.x,m.y,4.5,0,Math.PI*2);ctx.stroke();
  }
  ctx.globalAlpha=1;
  for(const a of world.agents){
    const c=colorForSymbol(a.symbol);ctx.fillStyle=c;ctx.globalAlpha=.82;
    const r=2.4+Math.min(2.8,a.energy/42);ctx.beginPath();ctx.arc(a.x,a.y,r,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.28;ctx.strokeStyle=c;ctx.beginPath();ctx.moveTo(a.x,a.y);
    ctx.lineTo(a.x-Math.cos(a.angle)*10,a.y-Math.sin(a.angle)*10);ctx.stroke();
  }
  ctx.globalAlpha=1;
}

function updateUI(){
  if(!world)return;
  const m=metrics(world);
  $('#tick').textContent=m.tick.toLocaleString();
  $('#population').textContent=m.population;
  $('#generation').textContent=m.maxGeneration;
  $('#settlements').textContent=m.settlements;
  $('#symbol').textContent=m.dominantSymbol ?? '–';
  $('#world-title').textContent=m.population ? '世界正在自己走。' : '這個世界安靜下來了。';
  $('#status-line').textContent=`從最近存檔繼續 · ${running?'即時運行':'暫停觀看'}`;
  const active=(world.interventions||[]).at(-1);
  $('#intervention').textContent=active?`進行中：${active.effect} · 到世界時間 ${active.untilTick.toLocaleString()}`:'目前沒有進行中的干預';
  const latest=[...world.timeline].reverse().find(e=>e.type==='intervention'||e.type==='observer');
  if(latest){$('#aguang-title').textContent=latest.title;$('#aguang-note').textContent=latest.detail||''}
  const myth=[...world.timeline].reverse().find(e=>e.type==='symbol'||e.type==='pattern');
  if(myth){$('#myth-title').textContent=myth.title;$('#myth-note').textContent=myth.detail}
  $('#timeline').innerHTML=world.timeline.slice(-14).reverse().map(e=>`<li><time>t ${Number(e.tick).toLocaleString()}</time><div><span class="event-title">${escapeHTML(e.title)}</span>${e.detail?`<span class="event-detail">${escapeHTML(e.detail)}</span>`:''}</div></li>`).join('');
}
function escapeHTML(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}

async function checkDirective(now){
  if(now-lastDirectiveCheck<5000)return;lastDirectiveCheck=now;
  try{
    const res=await fetch(`/assets/directive.json?t=${Date.now()}`,{cache:'no-store'});if(!res.ok)return;
    const d=await res.json();world.appliedDirectives ||= [];
    if(d?.id&&!world.appliedDirectives.includes(d.id)){applyIntervention(world,d);world.appliedDirectives.push(d.id);updateUI()}
  }catch{}
}
function loop(now){
  if(world&&running){const interval=100/Math.max(.5,speed);if(now-lastStep>=interval){step(world);lastStep=now}}
  if(world&&now-lastRender>90){draw();updateUI();lastRender=now}
  if(world)checkDirective(now);requestAnimationFrame(loop);
}
$('#toggle').addEventListener('click',()=>{running=!running;$('#toggle').textContent=running?'暫停':'繼續';updateUI()});
$('#speed').addEventListener('change',e=>{speed=Number(e.target.value)||1});
try{const res=await fetch(`/assets/world.json?t=${Date.now()}`,{cache:'no-store'});world=res.ok?await res.json():createWorld(230923)}catch{world=createWorld(230923)}
world.timeline ||= [];world.interventions ||= [];world.marks ||= [];world.appliedDirectives ||= [];
$('#loading').hidden=true;$('#toggle').disabled=false;$('#speed').disabled=false;$('#live-label').textContent='LIVE · 世界正在運行';
draw();updateUI();requestAnimationFrame(loop);
