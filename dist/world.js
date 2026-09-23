// Tiny Civilization v2 — deterministic sandbox engine.
export const RULES=Object.freeze({
  version:2,width:960,height:620,initialPopulation:64,populationLimit:320,maxAge:2400,
  initialEnergy:72,reproductionEnergy:94,mutation:.08,resourceSites:9,resourceRegen:.62,
  symbols:['△','○','∴','⋮','⌁','◇','⊙','∿']
});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function random(s){s.rng=(Math.imul(1664525,s.rng)+1013904223)>>>0;return s.rng/4294967296}
const rand=(s,a,b)=>a+(b-a)*random(s);
const pick=(s,a)=>a[Math.floor(random(s)*a.length)]??a[0];
const mutate=(s,v,r,a,b)=>clamp(v+(random(s)-.5)*r,a,b);

function event(s,type,title,detail=''){
  const key=`${type}:${title}`;
  if(s.timeline.slice(-12).some(e=>e.key===key&&s.tick-e.tick<150))return;
  s.timeline.push({tick:s.tick,type,title,detail,key});
  if(s.timeline.length>120)s.timeline.splice(0,s.timeline.length-120);
}
function resource(s,id){return{id,x:rand(s,70,890),y:rand(s,60,560),level:rand(s,45,85),capacity:rand(s,76,95)}}
function agent(s,id,parent=null){
  const p=parent==null?null:s.agents.find(a=>a.id===parent);
  return{
    id,parent,lineage:p?p.lineage:id,generation:p?p.generation+1:0,born:s.tick,age:0,
    x:p?clamp(p.x+rand(s,-14,14),3,957):rand(s,35,925),
    y:p?clamp(p.y+rand(s,-14,14),3,617):rand(s,35,585),
    angle:rand(s,0,Math.PI*2),energy:p?38:RULES.initialEnergy,
    speed:p?mutate(s,p.speed,.22,.45,1.8):rand(s,.65,1.35),
    sense:p?mutate(s,p.sense,10,28,92):rand(s,36,74),
    social:p?mutate(s,p.social,.2,-1,1):rand(s,-.25,.75),
    generosity:p?mutate(s,p.generosity,.18,0,1):rand(s,.05,.7),
    symbol:p&&random(s)>.12?p.symbol:pick(s,RULES.symbols),
    memories:p?p.memories.slice(0,2).map(m=>({...m,strength:m.strength*.72})):[]
  }
}
function remember(a,m){
  const old=a.memories.find(x=>x.symbol===m.symbol&&Math.hypot(x.x-m.x,x.y-m.y)<55);
  if(old){old.strength=clamp(Math.max(old.strength,m.strength)+.1,0,1.4);return}
  a.memories.push(m);a.memories.sort((x,y)=>y.strength-x.strength);a.memories=a.memories.slice(0,4);
}
function mutateSymbol(s,x){return random(s)<.13?pick(s,RULES.symbols.filter(v=>v!==x)):x}

export function createWorld(seed=230923){
  const s={version:2,seed,rng:seed>>>0,tick:0,nextId:1,agents:[],resources:[],marks:[],timeline:[],
    interventions:[],seenSignals:{},environment:{resourceRate:1,communication:1,memoryDecay:1}};
  for(let i=0;i<RULES.resourceSites;i++)s.resources.push(resource(s,i+1));
  for(let i=0;i<RULES.initialPopulation;i++)s.agents.push(agent(s,s.nextId++));
  event(s,'origin','世界開始',`第 ${RULES.initialPopulation} 個體進入世界。`);
  return s
}
function refresh(s){
  s.interventions=s.interventions.filter(x=>!x.untilTick||x.untilTick>s.tick);
  const e={resourceRate:1,communication:1,memoryDecay:1};
  for(const x of s.interventions){
    if(x.effect==='drought')e.resourceRate*=x.strength??.35;
    if(x.effect==='silence')e.communication*=x.strength??.08;
    if(x.effect==='memory_fog')e.memoryDecay*=x.strength??2;
  }
  s.environment=e;
}
export function applyIntervention(s,c={}){
  const t=c.type??'observe';
  if(t==='observe'){event(s,'observer','阿光選擇不干預',c.note??'先讓世界自己走。');return s}
  if(t==='resource_shift'){
    const r=pick(s,s.resources);r.x=rand(s,70,890);r.y=rand(s,60,560);r.level=Math.max(r.level,55);
    event(s,'intervention','資源地移動',`資源地 #${r.id} 改變位置。`);return s
  }
  if(t==='new_spring'){
    const id=Math.max(0,...s.resources.map(r=>r.id))+1;s.resources.push(resource(s,id));
    event(s,'intervention','新資源地出現',`世界多了一個補給來源 #${id}。`);return s
  }
  const map={drought:['乾旱開始','.35'],silence:['沉默期開始','.08'],memory_fog:['記憶霧出現','2']};
  if(!map[t])throw Error(`unknown intervention: ${t}`);
  const duration=clamp(c.duration??380,60,1800),fallback=Number(map[t][1]);
  s.interventions.push({effect:t,startedAt:s.tick,untilTick:s.tick+duration,strength:c.strength??fallback,note:c.note??''});
  event(s,'intervention',map[t][0],c.note??'世界條件暫時改變。');refresh(s);return s
}
function settlements(s){
  const bins=new Map();
  for(const a of s.agents){const k=`${Math.floor(a.x/80)},${Math.floor(a.y/80)}`;bins.set(k,(bins.get(k)||0)+1)}
  const cells=new Set([...bins].filter(([,n])=>n>=7).map(([k])=>k));let n=0;
  while(cells.size){n++;const start=cells.values().next().value,stack=[start];cells.delete(start);
    while(stack.length){const[x,y]=stack.pop().split(',').map(Number);
      for(const[nx,ny]of[[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){const k=`${nx},${ny}`;if(cells.delete(k))stack.push(k)}
    }}
  return n
}
export function metrics(s){
  const counts=new Map();let gen=0,energy=0;
  for(const a of s.agents){counts.set(a.symbol,(counts.get(a.symbol)||0)+1);gen=Math.max(gen,a.generation);energy+=a.energy}
  const [symbol,count]=[...counts].sort((a,b)=>b[1]-a[1])[0]??[null,0],n=s.agents.length;
  return{tick:s.tick,population:n,maxGeneration:gen,settlements:settlements(s),dominantSymbol:symbol,
    dominantShare:n?count/n:0,marks:s.marks.length,avgEnergy:n?energy/n:0,resources:s.resources.length,
    activeInterventions:s.interventions.length}
}
function signals(s){
  if(s.tick%90||!s.agents.length)return;const m=metrics(s);
  if(m.settlements>=3&&!s.seenSignals[`set-${m.settlements}`]){
    s.seenSignals[`set-${m.settlements}`]=1;event(s,'settlement',`形成 ${m.settlements} 個聚集區`,'先當作空間聚集，不急著命名為城市。')}
  if(m.dominantSymbol&&m.dominantShare>=.28&&m.maxGeneration>=3&&!s.seenSignals[`sym-${m.dominantSymbol}`]){
    s.seenSignals[`sym-${m.dominantSymbol}`]=1;event(s,'symbol',`符號 ${m.dominantSymbol} 開始跨世代流傳`,
      `${Math.round(m.dominantShare*100)}% 的存活個體攜帶它。先當作傳播現象。`)}
  const bins=new Map();
  for(const x of s.marks){const k=`${Math.floor(x.x/80)},${Math.floor(x.y/80)},${x.symbol}`;bins.set(k,(bins.get(k)||0)+1)}
  for(const[k,n]of bins)if(n>=6&&!s.seenSignals[`mark-${k}`]){
    s.seenSignals[`mark-${k}`]=1;event(s,'pattern',`某個地點反覆留下 ${k.split(',')[2]}`,`同一區域累積 ${n} 個相近標記。先觀察。`);break}
}
export function step(s){
  if(!s.agents.length)return s;s.tick++;refresh(s);
  for(const r of s.resources)r.level=Math.min(r.capacity,r.level+RULES.resourceRegen*s.environment.resourceRate);
  const prev=s.agents.map(a=>({...a,memories:a.memories.map(m=>({...m}))})),next=[],dead=[];
  for(const a0 of prev){
    const a={...a0,memories:a0.memories.map(m=>({...m}))};a.age++;
    for(const m of a.memories)m.strength*=Math.pow(.9994,s.environment.memoryDecay);
    a.memories=a.memories.filter(m=>m.strength>.08);
    let vx=Math.cos(a.angle)*.35,vy=Math.sin(a.angle)*.35,best=null,score=-1;
    for(const r of s.resources){const d=Math.hypot(r.x-a.x,r.y-a.y);if(d<a.sense*2.3&&r.level/(20+d)>score){score=r.level/(20+d);best=r}}
    if(best){const dx=best.x-a.x,dy=best.y-a.y,d=Math.hypot(dx,dy)||1;vx+=dx/d*.9;vy+=dy/d*.9}
    const near=prev.filter(b=>b.id!==a.id&&Math.hypot(b.x-a.x,b.y-a.y)<60);
    if(near.length){let sx=0,sy=0;for(const b of near){const d=Math.hypot(b.x-a.x,b.y-a.y)||1;sx+=(b.x-a.x)/d;sy+=(b.y-a.y)/d}
      vx+=sx/near.length*a.social*.62;vy+=sy/near.length*a.social*.62}
    for(const m of a.memories){const dx=m.x-a.x,dy=m.y-a.y,d=Math.hypot(dx,dy)||1;if(d<a.sense*2.4){const k=(m.kind==='danger'?-1:1)*m.strength*(1-d/(a.sense*2.4));vx+=dx/d*k*.5;vy+=dy/d*k*.5}}
    a.angle=Math.atan2(vy,vx)+(random(s)-.5)*.48;a.x=clamp(a.x+Math.cos(a.angle)*a.speed*2.15,3,957);a.y=clamp(a.y+Math.sin(a.angle)*a.speed*2.15,3,617);
    let meal=0;for(const r of s.resources){if(Math.hypot(r.x-a.x,r.y-a.y)<27&&r.level>0){const take=Math.min(r.level,2.15);r.level-=take;meal+=take;if(a.energy<34)remember(a,{kind:'aid',x:r.x,y:r.y,symbol:a.symbol,strength:.72})}}
    a.energy+=meal-(.13+.035*a.speed*a.speed+.00055*a.sense);
    if(near.length&&a.memories.length&&random(s)<.018*s.environment.communication){
      const b=pick(s,near),target=next.find(x=>x.id===b.id);if(target){const m=pick(s,a.memories);remember(target,{...m,symbol:mutateSymbol(s,m.symbol),strength:m.strength*.78})}}
    if(a.energy<=0||a.age>RULES.maxAge){dead.push(a);continue}
    if(a.energy>=RULES.reproductionEnergy&&a.age>90&&next.length<RULES.populationLimit){
      a.energy*=.53;const child=agent(s,s.nextId++,a.id);child.x=a.x+rand(s,-8,8);child.y=a.y+rand(s,-8,8);next.push(child)}
    next.push(a)
  }
  s.agents=next.slice(0,RULES.populationLimit);
  for(const d of dead){const symbol=d.memories[0]?.symbol??d.symbol;s.marks.push({tick:s.tick,x:d.x,y:d.y,symbol,lineage:d.lineage});
    if(s.marks.length>160)s.marks.splice(0,s.marks.length-160);
    for(const a of s.agents)if(Math.hypot(a.x-d.x,a.y-d.y)<58)remember(a,{kind:'danger',x:d.x,y:d.y,symbol:mutateSymbol(s,symbol),strength:.58})}
  signals(s);if(!s.agents.length)event(s,'extinction','世界失去最後一個個體','可以從存檔分支或重新開始。');return s
}
export function advance(s,ticks=1){for(let i=0;i<Math.min(200000,Math.max(0,Math.floor(ticks)))&&s.agents.length;i++)step(s);return s}
export function publicState(s){return JSON.parse(JSON.stringify(s))}
