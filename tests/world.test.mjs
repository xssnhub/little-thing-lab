import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance,applyIntervention,metrics,publicState} from '../src/world.mjs';

test('same seed is deterministic',()=>{
  const a=createWorld(42),b=createWorld(42);
  advance(a,500);advance(b,500);
  assert.deepEqual(a,b);
});

test('saved world resumes deterministically',()=>{
  const a=createWorld(77);
  advance(a,300);
  const saved=JSON.parse(JSON.stringify(a));
  advance(a,400);
  advance(saved,400);
  assert.deepEqual(a,saved);
});

test('interventions change environment and leave history',()=>{
  const w=createWorld(9);
  applyIntervention(w,{type:'drought',duration:200,strength:.25});
  advance(w,1);
  assert.equal(w.environment.resourceRate,.25);
  assert.ok(w.timeline.some(e=>e.title==='乾旱開始'));
});

test('world produces usable metrics',()=>{
  const w=createWorld(123);
  advance(w,900);
  const m=metrics(w);
  assert.ok(m.tick===900);
  assert.ok(m.population>=0);
  assert.ok(Number.isFinite(m.settlements));
});

test('public state is serializable',()=>{
  const w=createWorld(5);
  advance(w,50);
  const p=publicState(w);
  assert.doesNotThrow(()=>JSON.stringify(p));
  assert.equal(p.tick,50);
});
