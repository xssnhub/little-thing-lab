// Pure deterministic simulation. No network, files, clocks, or model calls.
export const RULES = Object.freeze({version: 1, width: 960, height: 600, cols: 40, rows: 25,
  initialPopulation: 50, populationLimit: 300, maxAge: 1800, reproductionEnergy: 105,
  initialEnergy: 62, foodBudget: 25, foodCapacity: 16, mutation: .12});

export function random(s) {
  s.rng = (Math.imul(1664525, s.rng) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
const clip = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, n) => (v % n + n) % n;
export const delta = (a,b,n) => {const d=b-a; return d > n/2 ? d-n : d < -n/2 ? d+n : d;};
function foodWeights(mode) {
  const a=[];
  for(let y=0;y<RULES.rows;y++) for(let x=0;x<RULES.cols;x++) {
    let w=1;
    if(mode==='patchy') {
      w=.025;
      for(const [cx,cy] of [[9,7],[29,17]]) {
        const dx=delta(x,cx,RULES.cols),dy=delta(y,cy,RULES.rows);
        w+=Math.exp(-(dx*dx+dy*dy)/14);
      }
    }
    a.push(w);
  }
  const total=a.reduce((a,b)=>a+b,0);
  return a.map(w=>w/total);
}
export function create(seed, mode='uniform') {
  if(!Number.isInteger(seed)||!['uniform','patchy'].includes(mode)) throw Error('Invalid seed or mode');
  const weights=foodWeights(mode);
  const s={rulesVersion:RULES.version,seed,mode,rng:seed>>>0,tick:0,nextId:51,births:0,deaths:0,
    food:weights.map(w=>w*1000),weights,agents:[],lineage:[],stopReason:null};
  for(let id=1;id<=50;id++) {
    const a={id,parent:null,founder:id,generation:0,x:random(s)*960,y:random(s)*600,
      angle:random(s)*Math.PI*2,energy:62,age:0,speed:.7+random(s)*1.2,
      sense:30+random(s)*45,social:random(s)*2-1};
    s.agents.push(a);s.lineage.push({id,parent:null,founder:id,generation:0,born:0});
  }
  return s;
}
function cell(x,y) {return Math.floor(wrap(y,600)/24)*40+Math.floor(wrap(x,960)/24);}
export function step(s) {
  if(s.stopReason) return s;
  s.tick++;
  for(let i=0;i<s.food.length;i++) s.food[i]=Math.min(16,s.food[i]+25*s.weights[i]);
  const previous=s.agents.map(a=>({...a}));
  // Rotating order avoids permanent first-agent access to food.
  const offset=s.tick % Math.max(1,previous.length);
  const ordered=[...previous.slice(offset),...previous.slice(0,offset)];
  const next=[];
  for(const a of ordered) {
    let fx=0,fy=0;
    for(let k=0;k<12;k++) {
      const t=k*Math.PI/6,x=a.x+Math.cos(t)*a.sense,y=a.y+Math.sin(t)*a.sense;
      const f=s.food[cell(x,y)];fx+=Math.cos(t)*f;fy+=Math.sin(t)*f;
    }
    let sx=0,sy=0,n=0;
    for(const b of previous) if(b.id!==a.id) {
      const dx=delta(a.x,b.x,960),dy=delta(a.y,b.y,600),d=Math.hypot(dx,dy);
      if(d<55 && d>0) {sx+=dx/d;sy+=dy/d;n++;}
    }
    const foodNorm=Math.hypot(fx,fy);
    if(foodNorm>0) {fx/=foodNorm;fy/=foodNorm;}
    const vx=Math.cos(a.angle)*.45+fx*1.1+(n?sx/n:0)*a.social*.85;
    const vy=Math.sin(a.angle)*.45+fy*1.1+(n?sy/n:0)*a.social*.85;
    a.angle=Math.atan2(vy,vx)+(random(s)-.5)*.6;
    a.x=wrap(a.x+Math.cos(a.angle)*a.speed*2.3,960);
    a.y=wrap(a.y+Math.sin(a.angle)*a.speed*2.3,600);
    const i=cell(a.x,a.y),meal=Math.min(1.8,s.food[i]);
    s.food[i]-=meal;
    a.energy+=meal-(.20+.065*a.speed*a.speed+.0011*a.sense);
    a.age++;
    if(a.energy<=0 || a.age>=RULES.maxAge) {s.deaths++;continue;}
    if(a.energy>=105 && a.age>70) {
      a.energy=(a.energy-9)/2;
      const child={...a,id:s.nextId++,parent:a.id,age:0,generation:a.generation+1,
        x:wrap(a.x+(random(s)-.5)*12,960),y:wrap(a.y+(random(s)-.5)*12,600),
        speed:clip(a.speed+(random(s)-.5)*.24,.4,2.2),
        sense:clip(a.sense+(random(s)-.5)*10,18,90),
        social:clip(a.social+(random(s)-.5)*.24,-1,1)};
      next.push(child);s.births++;
      s.lineage.push({id:child.id,parent:a.id,founder:child.founder,generation:child.generation,born:s.tick});
    }
    next.push(a);
  }
  s.agents=next;
  if(!next.length) s.stopReason='extinction';
  else if(next.length>=RULES.populationLimit) s.stopReason='population_limit';
  return s;
}
export function metrics(s) {
  const a=s.agents,n=a.length;
  let near=0,nearest=0;
  for(const p of a) {
    let d=Infinity;
    for(const q of a) if(q.id!==p.id) d=Math.min(d,Math.hypot(delta(p.x,q.x,960),delta(p.y,q.y,600)));
    if(d<45) near++;
    if(Number.isFinite(d)) nearest+=d;
  }
  const avg=k=>n?a.reduce((v,p)=>v+p[k],0)/n:0;
  return {tick:s.tick,population:n,births:s.births,deaths:s.deaths,
    clustered:n?near/n:0,nearest:n>1?nearest/n:null,energy:avg('energy'),
    speed:avg('speed'),sense:avg('sense'),social:avg('social'),
    lineages:new Set(a.map(p=>p.founder)).size,generation:n?Math.max(...a.map(p=>p.generation)):0};
}
export function frame(s) {
  return { ...metrics(s),food:s.food.map(v=>Math.round(v*10)/10),
    agents:s.agents.map(a=>[a.id,+a.x.toFixed(2),+a.y.toFixed(2),+a.angle.toFixed(3),+a.energy.toFixed(1),a.generation,a.founder,+a.social.toFixed(2)])};
}
export function advance(s,ticks) {for(let i=0;i<ticks&&!s.stopReason;i++) step(s);return s;}
