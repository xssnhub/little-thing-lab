import {createWorld,step,metrics,applyIntervention} from './world.js';

const $=q=>document.querySelector(q);
const canvas=$('#world');
const ctx=canvas.getContext('2d');
const symbols=['△','○','∴','⋮','⌁','◇','⊙','∿'];
const palette=['#7ad7ca','#edc277','#91aee8','#e58b93','#a9d28c','#c7a0df','#70c2e3','#e4d396'];
const clone=v=>JSON.parse(JSON.stringify(v));

let world=null;
let savedWorld=null;
let running=false;
let speed=1;
let activeRun=null;
let lastRender=0;
let lastStep=0;
let lastPoll=0;

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
    ctx.fillStyle=g;
    ctx.beginPath();
    ctx.arc(r.x,r.y,radius,0,Math.PI*2);
    ctx.fill();
  }

  for(const m of world.marks.slice(-100)){
    ctx.globalAlpha=.16;
    ctx.strokeStyle=colorForSymbol(m.symbol);
    ctx.beginPath();
    ctx.arc(m.x,m.y,4.5,0,Math.PI*2);
    ctx.stroke();
  }

  ctx.globalAlpha=1;
  for(const a of world.agents){
    const c=colorForSymbol(a.symbol);
    ctx.fillStyle=c;
    ctx.globalAlpha=.82;
    const r=2.4+Math.min(2.8,a.energy/42);
    ctx.beginPath();
    ctx.arc(a.x,a.y,r,0,Math.PI*2);
    ctx.fill();

    ctx.globalAlpha=.28;
    ctx.strokeStyle=c;
    ctx.beginPath();
    ctx.moveTo(a.x,a.y);
    ctx.lineTo(a.x-Math.cos(a.angle)*10,a.y-Math.sin(a.angle)*10);
    ctx.stroke();
  }
  ctx.globalAlpha=1;
}

function escapeHTML(v){
  return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function updateUI(){
  if(!world)return;
  const m=metrics(world);
  $('#tick').textContent=m.tick.toLocaleString();
  $('#population').textContent=m.population;
  $('#generation').textContent=m.maxGeneration;
  $('#settlements').textContent=m.settlements;
  $('#symbol').textContent=m.dominantSymbol ?? '–';

  if(activeRun){
    $('#world-title').textContent=running?'這一輪正在發生。':'這一輪暫停觀看。';
    $('#status-line').textContent=`世界時間 ${m.tick.toLocaleString()} / ${activeRun.targetTick.toLocaleString()}`;
    $('#live-label').textContent=running?'LIVE · 阿光正在跑':'PAUSED · 暫停觀看';
    $('#toggle').disabled=false;
    $('#toggle').textContent=running?'暫停':'繼續';
    const note=activeRun.directive?.note||'阿光正在觀察這一輪。';
    $('#aguang-title').textContent=activeRun.directive?.question||'阿光正在做一個小改變';
    $('#aguang-note').textContent=note;
    $('#intervention').textContent=`本輪：${activeRun.directive?.type||'observe'} · ${activeRun.ticks.toLocaleString()} 步`;
  }else{
    $('#world-title').textContent=m.population?'這一刻已經存下來。':'這個世界安靜下來了。';
    $('#status-line').textContent='等待阿光下一輪';
    $('#live-label').textContent='SAVED · 世界已存檔';
    $('#toggle').disabled=true;
    $('#toggle').textContent='等待下一輪';
    const latest=[...world.timeline].reverse().find(e=>e.type==='intervention'||e.type==='observer');
    if(latest){
      $('#aguang-title').textContent=latest.title;
      $('#aguang-note').textContent=latest.detail||'';
    }
    const active=(world.interventions||[]).at(-1);
    $('#intervention').textContent=active&&active.untilTick>world.tick
      ?`仍在影響：${active.effect} · 到世界時間 ${active.untilTick.toLocaleString()}`
      :'目前沒有進行中的干預';
  }

  const myth=[...world.timeline].reverse().find(e=>e.type==='symbol'||e.type==='pattern');
  if(myth){
    $('#myth-title').textContent=myth.title;
    $('#myth-note').textContent=myth.detail;
  }

  $('#timeline').innerHTML=world.timeline.slice(-14).reverse().map(e=>
    `<li><time>t ${Number(e.tick).toLocaleString()}</time><div><span class="event-title">${escapeHTML(e.title)}</span>${e.detail?`<span class="event-detail">${escapeHTML(e.detail)}</span>`:''}</div></li>`
  ).join('');
}

function seen(id){
  try{return localStorage.getItem('little-thing:last-seen-run')===id}catch{return false}
}
function markSeen(id){
  try{localStorage.setItem('little-thing:last-seen-run',id)}catch{}
}

function startRun(directive,ticks,base=world){
  if(!directive?.id||activeRun)return;
  world=clone(base);
  world.timeline ||= [];
  world.interventions ||= [];
  world.marks ||= [];
  world.appliedDirectives ||= [];

  if(!world.appliedDirectives.includes(directive.id)){
    applyIntervention(world,directive);
    world.appliedDirectives.push(directive.id);
  }

  const safeTicks=Math.max(0,Math.min(12000,Math.floor(ticks??directive.ticks??900)));
  activeRun={
    id:directive.id,
    directive:clone(directive),
    ticks:safeTicks,
    targetTick:world.tick+safeTicks
  };
  running=safeTicks>0;
  $('#toggle').disabled=!running;
  updateUI();
}

function finishRun(){
  if(!activeRun)return;
  const id=activeRun.id;
  markSeen(id);
  activeRun=null;
  running=false;
  if(savedWorld&&savedWorld.appliedDirectives?.includes(id))world=clone(savedWorld);
  draw();
  updateUI();
}

async function fetchJSON(path){
  const r=await fetch(`${path}?t=${Date.now()}`,{cache:'no-store'});
  if(!r.ok)throw Error(path);
  return r.json();
}

async function poll(now){
  if(now-lastPoll<3000)return;
  lastPoll=now;
  try{
    const [directive,summary]=await Promise.all([
      fetchJSON('./assets/directive.json'),
      fetchJSON('./assets/summary.json').catch(()=>null)
    ]);

    if(summary?.latestRun&&activeRun?.id===summary.latestRun){
      const latestSaved=await fetchJSON('./assets/world.json');
      savedWorld=latestSaved;
    }

    world.appliedDirectives ||= [];
    if(directive?.id&&!world.appliedDirectives.includes(directive.id)&&!activeRun){
      startRun(directive,directive.ticks,world);
    }
  }catch{}
}

function loop(now){
  if(world&&activeRun&&running){
    const interval=50;
    if(now-lastStep>=interval){
      const steps=speed===2?6:speed===.5?1:3;
      for(let i=0;i<steps&&world.tick<activeRun.targetTick;i++)step(world);
      lastStep=now;
      if(world.tick>=activeRun.targetTick)finishRun();
    }
  }

  if(world&&now-lastRender>80){
    draw();
    updateUI();
    lastRender=now;
  }

  if(world)poll(now);
  requestAnimationFrame(loop);
}

$('#toggle').addEventListener('click',()=>{
  if(!activeRun)return;
  running=!running;
  updateUI();
});

$('#speed').addEventListener('change',e=>{
  speed=Number(e.target.value)||1;
});

let previous=null;
let latestRun=null;
try{
  const values=await Promise.all([
    fetchJSON('./assets/world.json').catch(()=>createWorld(230923)),
    fetchJSON('./assets/previous-world.json').catch(()=>null),
    fetchJSON('./assets/latest-run.json').catch(()=>null)
  ]);
  savedWorld=values[0];
  previous=values[1];
  latestRun=values[2];
}catch{
  savedWorld=createWorld(230923);
}

world=clone(savedWorld);
world.timeline ||= [];
world.interventions ||= [];
world.marks ||= [];
world.appliedDirectives ||= [];

$('#loading').hidden=true;
$('#speed').disabled=false;

if(
  latestRun?.id &&
  previous &&
  latestRun.fromTick===previous.tick &&
  !seen(latestRun.id)
){
  startRun(latestRun.directive,latestRun.ticks,previous);
}else{
  updateUI();
}

draw();
requestAnimationFrame(loop);
