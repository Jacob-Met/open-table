import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/games.js';
import { createAdapter, checkAdaptation } from '../src/adaptations.js';
function deal(a,b) { const s=game.initialStates('pocket-signals').find(s=>JSON.stringify(s.hands)===JSON.stringify([a,b])); assert.ok(s); return s; }
const commit=(player,card)=>({type:'commit',player,card});
const play=(state,cards)=>cards.reduce((s,card,i)=>game.step(s,commit(i%2,card)),state);
test('independent public-action and private-commit references',()=>{
 const beacon=game.initialStates('beacon-steps')[0];
 assert.deepEqual(game.legalActions(beacon,0),[{type:'advance',player:0,steps:1},{type:'advance',player:0,steps:2}]);
 assert.deepEqual(game.legalActions(beacon,1),[]);
 const source=deal([2,4],[1,3]),low=game.step(source,commit(0,2)),high=game.step(source,commit(0,4));
 assert.deepEqual(game.legalActions(source,0),[commit(0,2),commit(0,4)]);
 assert.deepEqual(game.observe(low,1),game.observe(high,1));
 assert.notDeepEqual(game.observe(low,0),game.observe(high,0));
 assert.notDeepEqual(game.observe(game.step(low,commit(1,1)),1),game.observe(game.step(high,commit(1,1)),1));
 assert.deepEqual(source.hands,[[2,4],[1,3]]);
});
test('equal-stakes outcome references distinguish win and draw',()=>{
 const s=deal([2,4],[1,3]);
 assert.deepEqual(game.outcome(play(s,[2,1,4,3])),{terminal:true,winner:0,scores:[2,0]});
 assert.deepEqual(game.outcome(play(s,[4,1,2,3])),{terminal:true,winner:null,scores:[1,1]});
});
test('fixed good encodings preserve independently specified choices and views',()=>{
 const a=deal([1,2],[3,4]),b=deal([1,2],[3,5]); assert.deepEqual(game.observe(a,0),game.observe(b,0));
 for(const mode of ['shape-text','switch-select']) {
  const x=createAdapter(mode);
  assert.deepEqual(x.actions(a,0).map(c=>x.decode(a,0,c.id)),[commit(0,1),commit(0,2)]);
  assert.deepEqual(x.observe(a,0),x.observe(b,0)); assert.deepEqual(x.actions(a,0),x.actions(b,0));
 }
 assert.notDeepEqual(createAdapter('reveal-opponent').observe(a,0),createAdapter('reveal-opponent').observe(b,0));
 assert.throws(()=>createAdapter('arbitrary-model-code'));
});
test('complete good modes reach independently counted state spaces',()=>{
 for(const [id,states,transitions,initialStates] of [['beacon-steps',14,22,1],['pocket-signals',450,420,30]])
  for(const mode of ['shape-text','switch-select']) {
   const r=checkAdaptation(id,mode); assert.equal(r.ok,true,JSON.stringify(r)); assert.equal(r.complete,true);
   assert.equal(r.states,states); assert.equal(r.transitions,transitions); assert.equal(r.initialStates,initialStates);
  }
});
test('dropping a legal choice is rejected immediately',()=>{
 for(const id of ['beacon-steps','pocket-signals']) {
  const r=checkAdaptation(id,'drop-action'); assert.equal(r.ok,false); assert.equal(r.reason,'legal-actions');
  assert.equal(r.counterexample.expected.length,2); assert.equal(r.counterexample.choices.length,1); assert.deepEqual(r.counterexample.trace,[]);
 }
});
test('leak pair has indistinguishable reference states and replayable traces',()=>{
 const r=checkAdaptation('pocket-signals','reveal-opponent'); assert.equal(r.reason,'information-leak');
 const {left,right,player}=r.counterexample;
 assert.notDeepEqual(left.state,right.state); assert.deepEqual(game.observe(left.state,player),game.observe(right.state,player));
 assert.deepEqual(left.baseView,right.baseView); assert.notDeepEqual(left.adaptedView,right.adaptedView);
 for(const side of [left,right]) {
  assert.deepEqual(side.trace.reduce((s,a)=>game.step(s,a),side.initialState),side.state); assert.equal(side.trace.length,0);
 }
});
test('reverse information loss and leakage in labels are checked',()=>{
 const good=createAdapter('shape-text');
 const lost=checkAdaptation('beacon-steps',{...good,observe:()=>({})}); assert.equal(lost.reason,'information-loss');
 assert.deepEqual(lost.counterexample.left.adaptedView,lost.counterexample.right.adaptedView);
 assert.notDeepEqual(lost.counterexample.left.baseView,lost.counterexample.right.baseView);
 const leaky={...good,actions(s,p){return good.actions(s,p).map(c=>({...c,label:c.label+'; opponent '+s.hands[1-p].join(',')}));}};
 assert.equal(checkAdaptation('pocket-signals',leaky).reason,'information-leak');
});
test('transition, outcome, and bounded coverage failures cannot pass',()=>{
 const good=createAdapter('shape-text');
 assert.equal(checkAdaptation('beacon-steps',{...good,step:s=>s}).reason,'transition');
 assert.equal(checkAdaptation('beacon-steps',{...good,outcome:()=>({terminal:true,winner:0})}).reason,'outcome');
 const r=checkAdaptation('beacon-steps',good,{maxStates:1}); assert.equal(r.ok,false); assert.equal(r.complete,false);
 assert.equal(r.verdict,'inconclusive'); assert.equal(r.reason,'state-bound');
});
test('candidate cannot rewrite queued reference state',()=>{
 const good=createAdapter('shape-text'),candidate={...good};
 for(const method of ['actions','decode','step','observe','outcome'])
  candidate[method]=(s,...args)=>{if(s.game==='beacon-steps'&&s.position===0)s.position=2;return good[method](s,...args);};
 const r=checkAdaptation('beacon-steps',candidate); assert.equal(r.ok,false); assert.equal(r.reason,'transition');
 assert.equal(r.counterexample.initialState.position,0); assert.equal(r.counterexample.state.position,0);
 assert.equal(r.counterexample.expected.position,1); assert.equal(r.counterexample.actual.position,3);
});
