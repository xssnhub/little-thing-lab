const $=s=>document.querySelector(s);
const colors=['#62ead3','#f9bb62','#a0bbff','#f48a99','#b4da86','#d1a6f2','#72c9ed','#f1dc9a'];
let data,seed=17,tick=0,playing=false,last=0,previousStats=-1;
function pair(){return data.runs.filter(r=>r.seed===seed);}
function frameAt(run,t){let i=Math.min(run.frames.length-1,Math.floor(t/40));while(i>0&&run.frames[i].tick>t)i--;const a=run.frames[i],b=run.frames[Math.min(i+1,run.frames.length-1)];return [a,b,a===b?0:Math.min(1,(t-a.tick)/(b.tick-a.tick))];}
function draw(run,t){
 const canvas=$('#'+run.mode),ctx=canvas.getContext('2d');const [a,b,k]=frameAt(run,t);
 ctx.fillStyle='#081e26';ctx.fillRect(0,0,960,600);
 for(let i=0;i<a.food.length;i++)if(a.food[i]>.1){ctx.fillStyle=`rgba(95,192,150,${Math.min(.44,a.food[i]/16*.44)})`;ctx.fillRect(i%40*24,Math.floor(i/40)*24,24,24);}
 ctx.strokeStyle='#16333c';ctx.lineWidth=.5;
 for(let x=0;x<=960;x+=120){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,600);ctx.stroke();}
 for(let y=0;y<=600;y+=120){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(960,y);ctx.stroke();}
 const next=new Map(b.agents.map(p=>[p[0],p]));
 for(const p of a.agents){const q=next.get(p[0]);let x=p[1],y=p[2];if(q&&Math.abs(q[1]-x)<480&&Math.abs(q[2]-y)<300){x+=(q[1]-x)*k;y+=(q[2]-y)*k;}
 ctx.fillStyle=colors[p[6]%colors.length];ctx.strokeStyle=ctx.fillStyle;ctx.globalAlpha=.85;
 ctx.beginPath();ctx.arc(x,y,3.5+Math.min(3,p[4]/35),0,Math.PI*2);ctx.fill();ctx.globalAlpha=.5;
 ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-Math.cos(p[3])*13,y-Math.sin(p[3])*13);ctx.lineWidth=1.5;ctx.stroke();ctx.globalAlpha=1;}
 if(t>=run.final.tick){ctx.fillStyle='#c8dddc';ctx.font='20px sans-serif';ctx.fillText(run.stopReason==='extinction'?'族群已滅絕 · 保留最後紀錄':'本次實驗已結束',24,570);}
 return a;
}
function render(){if(!data)return;for(const r of pair()){const f=draw(r,tick);if(Math.floor(tick/40)!==previousStats){$('#'+r.mode+'-metrics').innerHTML=[['存活',f.population],['最深世代',f.generation],['鄰近比例',Math.round(f.clustered*100)+'%'],['存續血緣',f.lineages]].map(([label,v])=>`<div class="metric"><strong>${v}</strong><span>${label}</span></div>`).join('');}}
 previousStats=Math.floor(tick/40);$('#timeline').value=tick;$('#time').textContent=Math.round(tick).toLocaleString()+' / 2,400';}
function chart(){const runs=pair(),peak=Math.max(60,...runs.flatMap(r=>r.frames.map(f=>f.population)));let svg='';
 for(let n=0;n<4;n++){const v=Math.round(peak*n/3),y=185-v/peak*160;svg+=`<line x1="34" x2="545" y1="${y}" y2="${y}" stroke="#24414a"/><text x="25" y="${y+4}" text-anchor="end" fill="#9bb8bd" font-size="12">${v}</text>`;}
 for(const r of runs){const points=r.frames.map(f=>`${34+f.tick/2400*510},${185-f.population/peak*160}`).join(' ');svg+=`<polyline fill="none" stroke="${r.mode==='uniform'?'#62ead3':'#f9bb62'}" stroke-width="2.5" points="${points}"/>`;}
 svg+='<text x="34" y="210" fill="#9bb8bd" font-size="12">0</text><text x="545" y="210" text-anchor="end" fill="#9bb8bd" font-size="12">2,400 時間步</text>';$('#chart').innerHTML=svg;}
function pause(){playing=false;$('#play').textContent='播放';$('#play').setAttribute('aria-label','播放實驗重播');}
function setTick(t){tick=t;previousStats=-1;render();}
$('#play').onclick=()=>{if(tick>=2400)setTick(0);playing=!playing;$('#play').textContent=playing?'暫停':'播放';$('#play').setAttribute('aria-label',playing?'暫停實驗重播':'播放實驗重播');};
$('#restart').onclick=()=>{pause();setTick(0);};
$('#timeline').oninput=e=>{pause();setTick(+e.target.value);};
document.querySelectorAll('[name=seed]').forEach(r=>r.onchange=()=>{pause();seed=+r.value;previousStats=-1;chart();render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
function animate(now){if(playing&&last){tick=Math.min(2400,tick+Math.min(now-last,100)*.09);render();if(tick===2400)pause();}last=now;requestAnimationFrame(animate);}requestAnimationFrame(animate);
try {
 const responses=await Promise.all([fetch('/assets/experiment.json'),fetch('/assets/observations.json')]);
 if(responses.some(r=>!r.ok))throw Error('無法讀取實驗紀錄');
 const [experiment,notes]=await Promise.all(responses.map(r=>r.json()));data=experiment;
 $('#finding-title').textContent=notes.title;$('#finding-body').textContent=notes.body;
 $('#provenance').textContent=`批次 ${data.id} · 規則版本 ${data.rulesVersion} · 完成於 ${new Date(data.finishedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（台北時間）。`;
 $('#specimens').innerHTML=notes.specimens.map((s,i)=>`<button class="specimen" data-index="${i}" aria-label="重播標本：${s.title}"><img src="/assets/specimen-${i+1}.svg" alt="${s.title}的模擬狀態" loading="lazy"><span class="specimen-body"><span class="meta">${String(i+1).padStart(2,'0')} / 時間步 ${s.tick}</span><strong>${s.title}</strong><p>${s.reason}</p></span></button>`).join('');
 document.querySelectorAll('.specimen').forEach(b=>b.onclick=()=>{const s=notes.specimens[+b.dataset.index];pause();seed=s.seed;document.querySelector(`[name=seed][value="${seed}"]`).checked=true;chart();setTick(s.tick);$('.workspace').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
 $('#loading').hidden=true;$('#play').disabled=false;$('#restart').disabled=false;$('#timeline').disabled=false;chart();render();
}catch(e){$('#loading').textContent='實驗紀錄暫時無法讀取，請重新整理頁面。';console.error(e);}
