import {test} from 'node:test';import assert from 'node:assert/strict';
import {checkPermit} from '../scripts/gate.mjs';
const now=1800000000000;
const permit={id:'test',authorized:true,remainingPercent:[69,89],observedAt:now,startedAt:now};
test('fresh authorized batch passes',()=>assert.equal(checkPermit(permit,now),true));
test('missing, stale, low or unknown quota closes the gate',()=>{
  for(const p of [null,{...permit,authorized:false},{...permit,observedAt:now-900001},
    {...permit,remainingPercent:[25,90]},{...permit,remainingPercent:[]},
    {...permit,remainingPercent:[null]},{...permit,remainingPercent:[NaN]}])
    assert.throws(()=>checkPermit(p,now));
});
test('four-hour allowance includes fifteen minutes to close',()=>
  assert.throws(()=>checkPermit({...permit,startedAt:now-3.75*3600000},now)));
