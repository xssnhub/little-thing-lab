export function checkPermit(p, now=Date.now()) {
  if(!p || !p.authorized || !p.id || !Array.isArray(p.remainingPercent) || !p.remainingPercent.length)
    throw Error('需要本批放行與最新額度讀值');
  if(!Number.isFinite(p.observedAt)||now-p.observedAt>15*60*1000||p.observedAt>now)
    throw Error('額度讀值已過期：先讀取額度再繼續');
  if(p.remainingPercent.some(n=>!Number.isFinite(n)||n<=25||n>100)) throw Error('進入收束：額度不足或無效');
  if(!Number.isFinite(p.startedAt)||p.startedAt>now||now>=p.startedAt+4*3600*1000-15*60*1000)
    throw Error('進入收束：已到時間界線');
  return true;
}
