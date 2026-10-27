import test from 'node:test';
import assert from 'node:assert/strict';
import {legalActions,step,observe,outcome} from '../src/games.js';
import {DESIGNER_FIXTURE_IDS,resolveDesignerFixture} from '../src/designer-fixtures.js';
test('opaque fixtures resolve into reproducible legal traces',()=>{
 assert.equal(DESIGNER_FIXTURE_IDS.length,4);
 for(const id of DESIGNER_FIXTURE_IDS){const f=resolveDesignerFixture(id);assert.equal(f.fixtureId,id);
  for(const item of f.cases)assert.deepEqual(item.trace.reduce((s,a)=>step(s,a),item.initialState),item.state);}
 assert.throws(()=>resolveDesignerFixture('ot-fixture-999'));
});
test('Beacon fixtures exercise boundary and genuine terminal win',()=>{
 const s=resolveDesignerFixture('ot-fixture-001').cases[0].state;
 assert.equal(s.position,6);assert.deepEqual(legalActions(s,1),[{type:'advance',player:1,steps:1}]);
 assert.throws(()=>step(s,{type:'advance',player:1,steps:2}));
 const t=resolveDesignerFixture('ot-fixture-002').cases[0].state;
 assert.deepEqual(outcome(t),{terminal:true,winner:1});assert.deepEqual(legalActions(t,0),[]);assert.deepEqual(legalActions(t,1),[]);
});
test('Pocket fixtures bind hidden pending choices and equal-stakes draw',()=>{
 const f=resolveDesignerFixture('ot-fixture-003'),[left,right]=f.cases.map(x=>x.state);
 assert.notDeepEqual(left,right);assert.deepEqual(observe(left,f.viewer),observe(right,f.viewer));assert.notDeepEqual(observe(left,0),observe(right,0));
 assert.deepEqual(outcome(resolveDesignerFixture('ot-fixture-004').cases[0].state),{terminal:true,winner:null,scores:[1,1]});
});
