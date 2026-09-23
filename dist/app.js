import {createWorld,step,metrics,applyIntervention} from './world.js';

const $=q=>document.querySelector(q);
const canvas=$('#world');
const ctx=canvas.getContext('2d');
const symbols=['△','○','∴','⋮','⌁','◇','⊙','∿'];
const palette=['#7ad7ca','#edc277','#91aee8','#e58b93','#a9d28c','#c7a0df','#70c2e3','#e4d396'];
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

let world=null;
let running=true;
let speed=1;
let selected=null;
let trails=new Map();
let effects=[];
let lastStepAt=0;
let lastUIAt=0;
let lastPollAt=0;
let lastSaveNotice='';
let lastTimelineKey='';
let bannerUntil=0;
let frameTime=0;

function colorForSymbol(symbol){
  const i=Math.max(0,symbols.indexOf(symbol));
  return palette[i%palette.length];
}

function rgba(hex,a){
  const h=hex.replace('#','');
  const n=parseInt(h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function escapeHTML(v){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function fetchJSON(path){
  return fetch(`${path}?t=${Date.now()}`,{cache:'no-store'}).then(r=>{
    if(!r.ok)throw Error(path);
    return r.json();
  });
}

function memoryZones(){
  const bins=new Map();
  for(const mark of world?.marks||[]){
    const gx=Math.floor(mark.x/72),gy=Math.floor(mark.y/72),key=`${gx},${gy}`;
    if(!bins.has(key))bins.set(key,{x:0,y:0,count:0,symbols:new Map(),marks:[]});
    const z=bins.get(key);
    z.x+=mark.x;z.y+=mark.y;z.count++;z.marks.push(mark);
    z.symbols.set(mark.symbol,(z.symbols.get(mark.symbol)||0)+1);
  }
  return [...bins.values()].map(z=>{
    z.x/=z.count;z.y/=z.count;
    z.symbol=[...z.symbols].sort((a,b)=>b[1]-a[1])[0]?.[0]??'×';
    return z;
  }).sort((a,b)=>b.count-a.count);
}

function gatheringZones(){
  if(!world)return[];
  const bins=new Map();
  for(const a of world.agents){
    const gx=Math.floor(a.x/100),gy=Math.floor(a.y/100),key=`${gx},${gy}`;
    if(!bins.has(key))bins.set(key,{x:0,y:0,count:0});
    const z=bins.get(key);z.x+=a.x;z.y+=a.y;z.count++;
  }
  return [...bins.values()]
    .filter(z=>z.count>=5)
    .map(z=>({...z,x:z.x/z.count,y:z.y/z.count}));
}

function nearestResource(a){
  let best=null,bestD=Infinity;
  for(const r of world.resources){
    const d=Math.hypot(r.x-a.x,r.y-a.y);
    if(d<bestD){bestD=d;best=r}
  }
  return{resource:best,distance:bestD};
}

function neighbors(a,range=58){
  return world.agents.filter(b=>b.id!==a.id&&Math.hypot(b.x-a.x,b.y-a.y)<range);
}

function behaviorOf(a){
  const near=neighbors(a);
  const {resource,distance}=nearestResource(a);
  if(a.energy<24)return '很虛弱，正在拚命找吃的';
  if(a.energy>86&&a.age>90)return '能量很高，接近繁殖狀態';
  if(near.length>=5)return `待在一群 ${near.length+1} 隻的小聚落裡`;
  if(resource&&distance<110)return '正在靠近資源地';
  if(a.memories?.some(m=>m.kind==='danger'&&Math.hypot(m.x-a.x,m.y-a.y)<120))return '附近有危險記憶，牠正在繞開';
  if(a.memories?.length)return '帶著記憶在世界裡移動';
  return '正在探索';
}

function pushEffect(type,x,y,symbol=null){
  effects.push({type,x,y,symbol,life:1});
  if(effects.length>90)effects=effects.slice(-90);
}

function updateTrails(){
  const alive=new Set(world.agents.map(a=>a.id));
  for(const id of trails.keys())if(!alive.has(id))trails.delete(id);
  for(const a of world.agents){
    const t=trails.get(a.id)||[];
    const last=t.at(-1);
    if(!last||Math.hypot(last.x-a.x,last.y-a.y)>2.5)t.push({x:a.x,y:a.y});
    while(t.length>16)t.shift();
    trails.set(a.id,t);
  }
}

function simulateOne(){
  if(!world?.agents?.length)return;
  const before=new Map(world.agents.map(a=>[a.id,{x:a.x,y:a.y,symbol:a.symbol}]));
  step(world);
  const afterIds=new Set(world.agents.map(a=>a.id));

  for(const a of world.agents){
    if(!before.has(a.id))pushEffect('birth',a.x,a.y,a.symbol);
  }
  for(const [id,a] of before){
    if(!afterIds.has(id)){
      pushEffect('death',a.x,a.y,a.symbol);
      if(selected?.type==='agent'&&selected.id===id){
        selected={type:'place',x:a.x,y:a.y,note:'你剛剛看的這隻小東西死在這裡，牠的痕跡留進了世界。'};
      }
    }
  }
  updateTrails();
}

function drawBackground(){
  ctx.fillStyle='#071517';
  ctx.fillRect(0,0,960,620);

  ctx.strokeStyle='rgba(180,220,211,.025)';
  ctx.lineWidth=1;
  for(let x=40;x<960;x+=80){
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,620);ctx.stroke();
  }
  for(let y=40;y<620;y+=80){
    ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();
  }

  const drought=(world.interventions||[]).some(i=>i.effect==='drought'&&i.untilTick>world.tick);
  const fog=(world.interventions||[]).some(i=>i.effect==='memory_fog'&&i.untilTick>world.tick);
  if(drought){
    ctx.fillStyle='rgba(185,125,72,.07)';
    ctx.fillRect(0,0,960,620);
  }
  if(fog){
    ctx.fillStyle='rgba(185,193,214,.045)';
    ctx.fillRect(0,0,960,620);
  }
}

function drawResources(){
  for(const r of world.resources){
    const ratio=clamp(r.level/r.capacity,0,1);
    const pulse=Math.sin(frameTime/550+r.id)*2;
    const radius=22+ratio*25+pulse;
    const g=ctx.createRadialGradient(r.x,r.y,3,r.x,r.y,radius);
    g.addColorStop(0,`rgba(122,215,202,${.24+.3*ratio})`);
    g.addColorStop(.42,`rgba(122,215,202,${.08+.12*ratio})`);
    g.addColorStop(1,'rgba(122,215,202,0)');
    ctx.fillStyle=g;
    ctx.beginPath();ctx.arc(r.x,r.y,radius,0,Math.PI*2);ctx.fill();

    ctx.strokeStyle=`rgba(122,215,202,${.18+.35*ratio})`;
    ctx.lineWidth=1.4;
    ctx.beginPath();ctx.arc(r.x,r.y,10+ratio*7,0,Math.PI*2);ctx.stroke();

    if(selected?.type==='resource'&&selected.id===r.id){
      ctx.strokeStyle='#edf5f2';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(r.x,r.y,25+ratio*7,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#edf5f2';ctx.font='600 12px system-ui';ctx.textAlign='center';
      ctx.fillText(`資源地 #${r.id}`,r.x,r.y-31);
    }
  }
}

function drawMemory(){
  const zones=memoryZones();
  for(const mark of world.marks.slice(-130)){
    const age=Math.max(0,world.tick-mark.tick);
    const alpha=clamp(.32-age/5500,.08,.3);
    ctx.strokeStyle=rgba(colorForSymbol(mark.symbol),alpha);
    ctx.lineWidth=1.1;
    const s=3.5;
    ctx.beginPath();
    ctx.moveTo(mark.x-s,mark.y-s);ctx.lineTo(mark.x+s,mark.y+s);
    ctx.moveTo(mark.x+s,mark.y-s);ctx.lineTo(mark.x-s,mark.y+s);
    ctx.stroke();
  }

  for(const z of zones.filter(z=>z.count>=4)){
    const radius=22+Math.min(30,z.count*2.4);
    ctx.strokeStyle=rgba(colorForSymbol(z.symbol),.2);
    ctx.setLineDash([4,6]);ctx.lineWidth=1.3;
    ctx.beginPath();ctx.arc(z.x,z.y,radius,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=rgba(colorForSymbol(z.symbol),.72);
    ctx.font='700 13px system-ui';ctx.textAlign='center';
    ctx.fillText(`${z.symbol} ×${z.count}`,z.x,z.y-radius-6);
  }
}

function drawGatherings(){
  for(const z of gatheringZones()){
    const radius=30+z.count*3;
    ctx.fillStyle='rgba(237,245,242,.018)';
    ctx.strokeStyle='rgba(237,245,242,.11)';
    ctx.setLineDash([2,6]);
    ctx.beginPath();ctx.arc(z.x,z.y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle='rgba(237,245,242,.5)';
    ctx.font='600 10px system-ui';ctx.textAlign='center';
    ctx.fillText(`聚集 ${z.count}`,z.x,z.y-radius-5);
  }
}

function drawTrails(){
  for(const a of world.agents){
    const t=trails.get(a.id);
    if(!t||t.length<2)continue;
    const strong=selected?.type==='agent'&&selected.id===a.id;
    ctx.strokeStyle=rgba(colorForSymbol(a.symbol),strong ? .55 : .11);
    ctx.lineWidth=strong?2.2:1;
    ctx.beginPath();
    ctx.moveTo(t[0].x,t[0].y);
    for(let i=1;i<t.length;i++)ctx.lineTo(t[i].x,t[i].y);
    ctx.stroke();
  }
}

function drawSelectedMemory(a){
  if(selected?.type!=='agent'||selected.id!==a.id)return;
  for(const m of a.memories||[]){
    ctx.strokeStyle=rgba(colorForSymbol(m.symbol),.32);
    ctx.setLineDash([3,5]);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(m.x,m.y);ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle=rgba(colorForSymbol(m.symbol),.85);
    ctx.font='700 11px system-ui';ctx.textAlign='center';
    ctx.fillText(m.symbol,m.x,m.y-7);
  }
}

function drawAgents(){
  for(const a of world.agents)drawSelectedMemory(a);

  for(const a of world.agents){
    const c=colorForSymbol(a.symbol);
    const selectedNow=selected?.type==='agent'&&selected.id===a.id;
    const body=4.6+Math.min(2.6,a.energy/48);

    if(a.energy<24){
      ctx.fillStyle='rgba(222,139,139,.10)';
      ctx.beginPath();ctx.arc(a.x,a.y,13,0,Math.PI*2);ctx.fill();
    }

    ctx.save();
    ctx.translate(a.x,a.y);
    ctx.rotate(a.angle);

    ctx.strokeStyle=rgba(c,selectedNow?1:.62);
    ctx.fillStyle=selectedNow?'#edf5f2':'rgba(225,238,234,.88)';
    ctx.lineWidth=selectedNow?2.2:1.2;
    ctx.beginPath();
    ctx.ellipse(0,0,body,body*1.45,0,0,Math.PI*2);
    ctx.fill();ctx.stroke();

    ctx.fillStyle=c;
    ctx.beginPath();ctx.arc(body*.25,-body*.55,1.8,0,Math.PI*2);ctx.fill();

    ctx.strokeStyle=rgba(c,.35);
    ctx.beginPath();ctx.moveTo(0,body*.9);ctx.lineTo(-Math.cos(.5)*6,body*1.9);ctx.stroke();
    ctx.restore();

    if(selectedNow){
      ctx.strokeStyle='#edf5f2';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.arc(a.x,a.y,14,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#edf5f2';ctx.font='700 11px system-ui';ctx.textAlign='center';
      ctx.fillText(`#${a.id}  ${a.symbol}`,a.x,a.y-19);
    }else if(a.generation>=4){
      ctx.fillStyle=rgba(c,.7);ctx.font='700 8px system-ui';ctx.textAlign='center';
      ctx.fillText(a.symbol,a.x,a.y-10);
    }
  }
}

function drawEffects(){
  const next=[];
  for(const e of effects){
    const c=e.type==='birth'?'#7ad7ca':'#e5c17a';
    const radius=8+(1-e.life)*28;
    ctx.strokeStyle=rgba(c,e.life*.7);
    ctx.lineWidth=1.8;
    ctx.beginPath();ctx.arc(e.x,e.y,radius,0,Math.PI*2);ctx.stroke();
    if(e.type==='birth'){
      ctx.fillStyle=rgba(c,e.life);
      ctx.font='700 10px system-ui';ctx.textAlign='center';
      ctx.fillText('出生',e.x,e.y-radius-3);
    }else{
      ctx.fillStyle=rgba(c,e.life);
      ctx.font='700 10px system-ui';ctx.textAlign='center';
      ctx.fillText('留下痕跡',e.x,e.y-radius-3);
    }
    e.life-=.022;
    if(e.life>0)next.push(e);
  }
  effects=next;
}

function drawSelectionPlace(){
  if(selected?.type!=='place')return;
  ctx.strokeStyle='rgba(237,245,242,.8)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(selected.x,selected.y,18,0,Math.PI*2);ctx.stroke();
}

function draw(){
  if(!world)return;
  drawBackground();
  drawMemory();
  drawGatherings();
  drawResources();
  drawTrails();
  drawAgents();
  drawSelectionPlace();
  drawEffects();
}

function showBanner(kind,title){
  $('#event-kind').textContent=kind;
  $('#event-title').textContent=title;
  $('#event-banner').hidden=false;
  bannerUntil=performance.now()+3600;
}

function plainSummary(m){
  const active=(world.interventions||[]).filter(i=>i.untilTick>world.tick);
  if(active.some(i=>i.effect==='drought'))return['乾旱正在改變牠們的路線。','資源恢復變慢，小東西會被迫重新找地方。'];
  if(m.population===0)return['世界沒有存活者了。','這一支文明在這條時間線上結束。'];
  if(m.population<12)return['族群正在變得很薄。','每一次出生與死亡都會開始影響整個世界。'];
  const zone=memoryZones()[0];
  if(zone?.count>=8)return['有一塊地方開始「有歷史」了。',`那裡已累積 ${zone.count} 次死亡痕跡，附近的小東西可能記住它。`];
  if(m.dominantSymbol&&m.dominantShare>=.32&&m.maxGeneration>=3)return[
    `符號 ${m.dominantSymbol} 正在跨世代流傳。`,
    `目前約 ${Math.round(m.dominantShare*100)}% 的存活者帶著它。`
  ];
  if(m.settlements>=2)return[`${m.settlements} 個聚集區正在形成。','牠們正在資源與彼此之間找到暫時的生活中心。'];
  return['世界正在自己走。','有的覓食，有的結群，有的帶著上一代留下來的記憶。'];
}

function populationSignal(m){
  if(m.population<12)return'族群很稀薄';
  if(m.population<30)return'族群偏少';
  if(m.population>150)return'族群非常密集';
  return'族群仍在延續';
}

function renderTimeline(){
  const items=(world.timeline||[]).slice(-7).reverse();
  $('#timeline').innerHTML=items.map(e=>
    `<li><time>t${Number(e.tick).toLocaleString()}</time><div><span class="event-title">${escapeHTML(e.title)}</span>${e.detail?`<span class="event-detail">${escapeHTML(e.detail)}</span>`:''}</div></li>`
  ).join('');
}

function renderInspector(){
  const empty=$('#inspector-empty'),content=$('#inspector-content');
  if(!selected){
    empty.hidden=false;content.hidden=true;return;
  }
  empty.hidden=true;content.hidden=false;

  if(selected.type==='agent'){
    const a=world.agents.find(x=>x.id===selected.id);
    if(!a){selected=null;renderInspector();return}
    const near=neighbors(a);
    const mem=(a.memories||[]).slice(0,4);
    content.innerHTML=`
      <div class="symbol-big" style="color:${colorForSymbol(a.symbol)}">${escapeHTML(a.symbol)}</div>
      <h2>小東西 #${a.id}</h2>
      <p>${escapeHTML(behaviorOf(a))}。</p>
      <div class="inspector-grid">
        <div class="stat"><span>能量</span><strong>${Math.round(a.energy)}</strong></div>
        <div class="stat"><span>年齡</span><strong>${a.age}</strong></div>
        <div class="stat"><span>第幾代</span><strong>${a.generation}</strong></div>
        <div class="stat"><span>附近同伴</span><strong>${near.length}</strong></div>
        <div class="stat"><span>家族源頭</span><strong>#${a.lineage}</strong></div>
        <div class="stat"><span>親代</span><strong>${a.parent?`#${a.parent}`:'初代'}</strong></div>
      </div>
      <p><strong>牠記得：</strong></p>
      <ul class="memory-list">${mem.length?mem.map(m=>`<li>${m.kind==='danger'?'危險':'資源'}記憶 · ${escapeHTML(m.symbol)} · 強度 ${Math.round(m.strength*100)}%</li>`).join(''):'<li>目前沒有留下明顯記憶。</li>'}</ul>
    `;
    return;
  }

  if(selected.type==='resource'){
    const r=world.resources.find(x=>x.id===selected.id);
    if(!r){selected=null;renderInspector();return}
    const near=world.agents.filter(a=>Math.hypot(a.x-r.x,a.y-r.y)<80);
    content.innerHTML=`
      <div class="symbol-big" style="color:#7ad7ca">◉</div>
      <h2>資源地 #${r.id}</h2>
      <p>這裡是附近小東西會被吸引過來的食物來源。</p>
      <div class="inspector-grid">
        <div class="stat"><span>剩餘資源</span><strong>${Math.round(r.level)} / ${Math.round(r.capacity)}</strong></div>
        <div class="stat"><span>附近小東西</span><strong>${near.length}</strong></div>
      </div>
    `;
    return;
  }

  const x=selected.x,y=selected.y;
  const marks=world.marks.filter(m=>Math.hypot(m.x-x,m.y-y)<70);
  const agents=world.agents.filter(a=>Math.hypot(a.x-x,a.y-y)<70);
  const resources=world.resources.filter(r=>Math.hypot(r.x-x,r.y-y)<90);
  const symCounts=new Map();
  for(const m of marks)symCounts.set(m.symbol,(symCounts.get(m.symbol)||0)+1);
  const top=[...symCounts].sort((a,b)=>b[1]-a[1])[0];
  content.innerHTML=`
    <div class="symbol-big" style="color:#e5c17a">${top?.[0]??'·'}</div>
    <h2>${marks.length>=6?'一塊正在累積歷史的地方':'世界中的一個地方'}</h2>
    <p>${escapeHTML(selected.note||(
      marks.length>=6
        ?`這附近留下了 ${marks.length} 次死亡痕跡。它可能慢慢變成後代會記住、靠近或避開的地方。`
        :'這裡目前還沒有形成強烈的歷史。'
    ))}</p>
    <div class="inspector-grid">
      <div class="stat"><span>死亡痕跡</span><strong>${marks.length}</strong></div>
      <div class="stat"><span>附近存活者</span><strong>${agents.length}</strong></div>
      <div class="stat"><span>附近資源地</span><strong>${resources.length}</strong></div>
      <div class="stat"><span>主要痕跡</span><strong>${top?.[0]??'–'}</strong></div>
    </div>
  `;
}

function updateUI(){
  if(!world)return;
  const m=metrics(world);
  const [title,note]=plainSummary(m);
  $('#tick').textContent=m.tick.toLocaleString();
  $('#population').textContent=m.population;
  $('#generation').textContent=m.maxGeneration;
  $('#settlements').textContent=m.settlements;
  $('#now-title').textContent=title;
  $('#now-note').textContent=note;
  $('#signal-pop').textContent=populationSignal(m);
  $('#signal-symbol').textContent=m.dominantSymbol
    ?`${m.dominantSymbol} · ${Math.round(m.dominantShare*100)}%`
    :'符號尚未成形';
  $('#dominant-symbol').textContent=m.dominantSymbol??'';
  $('#world-title').textContent=m.population?'這群小東西正在活。':'這個世界安靜下來了。';
  $('#world-explain').textContent=m.population
    ?'牠們會找食物、靠近彼此、繁殖、死亡，也會把記憶和符號帶給下一代。'
    :'這條世界線目前沒有存活者。';
  $('#live-label').textContent=running?'LIVE · 世界正在走':'PAUSED · 世界暫停';
  $('#toggle').textContent=running?'暫停':'繼續';

  const latestAI=[...(world.timeline||[])].reverse().find(e=>e.type==='intervention'||e.type==='observer');
  if(latestAI){
    $('#aguang-title').textContent=latestAI.title;
    $('#aguang-note').textContent=latestAI.detail||'';
  }else{
    $('#aguang-title').textContent='先讓世界自己說話。';
    $('#aguang-note').textContent='目前沒有新的干預。';
  }

  const active=(world.interventions||[]).filter(i=>i.untilTick>world.tick);
  $('#intervention').textContent=active.length
    ?active.map(i=>({drought:'乾旱',silence:'沉默期',memory_fog:'記憶霧'}[i.effect]||i.effect)).join(' · ')
    :'觀察中';

  $('#world-status').textContent=lastSaveNotice||'世界從最近一次 Git 存檔繼續往前走。';
  renderTimeline();
  renderInspector();

  const latest=(world.timeline||[]).at(-1);
  if(latest&&latest.key!==lastTimelineKey){
    if(lastTimelineKey)showBanner(
      latest.type==='intervention'?'阿光介入':latest.type==='symbol'?'跨世代變化':latest.type==='pattern'?'地方開始有記憶':'世界事件',
      latest.title
    );
    lastTimelineKey=latest.key;
  }
}

function screenToWorld(ev){
  const rect=canvas.getBoundingClientRect();
  return{x:(ev.clientX-rect.left)*960/rect.width,y:(ev.clientY-rect.top)*620/rect.height};
}

canvas.addEventListener('click',ev=>{
  if(!world)return;
  const p=screenToWorld(ev);

  let bestAgent=null,bestD=Infinity;
  for(const a of world.agents){
    const d=Math.hypot(a.x-p.x,a.y-p.y);
    if(d<bestD){bestD=d;bestAgent=a}
  }
  if(bestAgent&&bestD<22){
    selected={type:'agent',id:bestAgent.id};
    updateUI();return;
  }

  let bestResource=null,resD=Infinity;
  for(const r of world.resources){
    const d=Math.hypot(r.x-p.x,r.y-p.y);
    if(d<resD){resD=d;bestResource=r}
  }
  if(bestResource&&resD<34){
    selected={type:'resource',id:bestResource.id};
    updateUI();return;
  }

  const zone=memoryZones().find(z=>Math.hypot(z.x-p.x,z.y-p.y)<36+Math.min(30,z.count*2));
  selected=zone
    ?{type:'place',x:zone.x,y:zone.y,note:`這附近已經累積 ${zone.count} 次死亡痕跡。`}
    :{type:'place',x:p.x,y:p.y};
  updateUI();
});

$('#toggle').addEventListener('click',()=>{
  running=!running;
  updateUI();
});

document.querySelectorAll('.speed').forEach(btn=>btn.addEventListener('click',()=>{
  speed=Number(btn.dataset.speed)||1;
  document.querySelectorAll('.speed').forEach(b=>b.classList.toggle('active',b===btn));
}));

async function pollServer(now){
  if(now-lastPollAt<5000)return;
  lastPollAt=now;
  try{
    const [directive,summary]=await Promise.all([
      fetchJSON('./assets/directive.json'),
      fetchJSON('./assets/summary.json').catch(()=>null)
    ]);

    world.appliedDirectives ||= [];
    if(directive?.id&&!world.appliedDirectives.includes(directive.id)){
      applyIntervention(world,directive);
      world.appliedDirectives.push(directive.id);
      showBanner('阿光介入',directive.question||directive.note||'世界條件改變了');
      updateUI();
    }

    if(summary?.latestRun&&summary.latestRun!==lastSaveNotice){
      lastSaveNotice=`Git 已封存世界到 t ${Number(summary.tick||0).toLocaleString()}`;
    }
  }catch{}
}

function loop(now){
  frameTime=now;
  if(world&&running&&world.agents.length){
    const interval=90;
    if(now-lastStepAt>=interval){
      const count=speed===4?4:speed===2?2:1;
      for(let i=0;i<count;i++)simulateOne();
      lastStepAt=now;
    }
  }

  draw();

  if(world&&now-lastUIAt>240){
    updateUI();
    lastUIAt=now;
  }

  if(world)pollServer(now);

  if(!$('#event-banner').hidden&&now>bannerUntil)$('#event-banner').hidden=true;
  requestAnimationFrame(loop);
}

try{
  world=await fetchJSON('./assets/world.json');
}catch{
  world=createWorld(230923);
}
world.timeline ||= [];
world.interventions ||= [];
world.marks ||= [];
world.appliedDirectives ||= [];

updateTrails();
lastTimelineKey=world.timeline.at(-1)?.key??'';
$('#loading').hidden=true;
updateUI();
requestAnimationFrame(loop);
