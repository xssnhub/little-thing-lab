import {test} from 'node:test';
import assert from 'node:assert/strict';
import {create,advance,metrics,RULES} from '../src/life.mjs';
test('same seed reproduces and JSON snapshot resumes exactly',()=>{
  const direct=advance(create(42,'patchy'),300);
  const resumed=advance(JSON.parse(JSON.stringify(advance(create(42,'patchy'),150))),150);
  assert.deepEqual(resumed,direct);
});
test('paired worlds start with the same organisms and food budget',()=>{
  const a=create(7),b=create(7,'patchy');
  assert.deepEqual(a.agents,b.agents);
  assert.ok(Math.abs(a.weights.reduce((s,v)=>s+v,0)-1)<1e-10);
  assert.ok(Math.abs(b.weights.reduce((s,v)=>s+v,0)-1)<1e-10);
  assert.notDeepEqual(a.food,b.food);
});
test('energy, coordinates, population accounting and ancestry remain valid',()=>{
  for(const mode of ['uniform','patchy']) {
    const s=advance(create(11,mode),1000);
    assert.equal(s.agents.length,50+s.births-s.deaths);
    assert.equal(new Set(s.lineage.map(a=>a.id)).size,s.lineage.length);
    for(const a of s.agents) {
      assert.ok(a.energy>0&&Number.isFinite(a.energy));
      assert.ok(a.x>=0&&a.x<960&&a.y>=0&&a.y<600);
      if(a.parent) assert.ok(s.lineage.some(p=>p.id===a.parent&&p.generation===a.generation-1));
    }
    assert.ok(s.food.every(f=>f>=0&&f<=RULES.foodCapacity));
    assert.ok(metrics(s).clustered>=0&&metrics(s).clustered<=1);
  }
});
test('extinction is preserved rather than silently reseeded',()=>{
  const s=create(4);s.agents=[];advance(s,20);
  assert.equal(s.stopReason,'extinction');assert.equal(s.tick,1);
});
