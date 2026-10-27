import test from 'node:test';
import assert from 'node:assert/strict';
import {initialStates,legalActions,step,observe,outcome,stateKey} from '../src/games.js';
const B='beacon-steps',P='pocket-signals',advance=(player,steps)=>({type:'advance',player,steps}),commit=(player,card)=>({type:'commit',player,card});
function pocket(a=[2,4],b=[1,3]){const s=initialStates(P).find(x=>JSON.stringify(x.hands)===JSON.stringify([a,b]));assert.ok(s);return s;}
function freezeDeep(v){if(v&&typeof v==='object'){Object.values(v).forEach(freezeDeep);Object.freeze(v);}return v;}
const play=cards=>cards.reduce((s,c,i)=>step(s,commit(i%2,c)),pocket());
test('Beacon requires exact arrival, alternates actors and stops at seven',()=>{
 let s=initialStates(B)[0];assert.deepEqual(s,{game:B,position:0,turn:0});assert.deepEqual(legalActions(s,1),[]);assert.throws(()=>step(s,advance(1,1)),RangeError);
 for(const [p,position] of [[0,2],[1,4],[0,6]]){s=step(s,advance(p,2));assert.equal(s.position,position);assert.equal(s.turn,1-p);assert.deepEqual(outcome(s),{terminal:false,winner:null});}
 assert.deepEqual(legalActions(s,1),[advance(1,1)]);assert.throws(()=>step(s,advance(1,2)),RangeError);
 const t=step(s,advance(1,1));assert.equal(t.position,7);assert.equal(t.turn,0);assert.deepEqual(outcome(t),{terminal:true,winner:1});assert.equal(observe(t,0).turn,null);
 for(const p of [0,1]){assert.deepEqual(legalActions(t,p),[]);assert.throws(()=>step(t,advance(p,1)),RangeError);}
});
test('equal round stakes retain distinct winning and drawing pairings',()=>{
 const win=play([2,1,4,3]),draw=play([4,1,2,3]);
 assert.deepEqual(outcome(win),{terminal:true,winner:0,scores:[2,0]});assert.deepEqual(outcome(draw),{terminal:true,winner:null,scores:[1,1]});
 for(const s of [win,draw]){assert.deepEqual(s.hands,[[],[]]);assert.deepEqual(s.committed,[null,null]);assert.equal(s.history.length,2);
  for(const p of [0,1]){assert.deepEqual(legalActions(s,p),[]);assert.equal(observe(s,p).turn,null);assert.throws(()=>step(s,commit(p,1)),RangeError);}}
});
test('reveal is atomic, conserves cards and returns to first player',()=>{
 const initial=pocket(),pending=step(initial,commit(0,2));
 assert.deepEqual(pending.hands,[[2,4],[1,3]]);assert.deepEqual(pending.committed,[2,null]);assert.deepEqual(pending.history,[]);
 assert.deepEqual(outcome(pending),{terminal:false,winner:null,scores:[0,0]});assert.deepEqual(legalActions(pending,0),[]);
 const r=step(pending,commit(1,1));assert.deepEqual(r.hands,[[4],[3]]);assert.deepEqual(r.committed,[null,null]);assert.deepEqual(r.history,[{cards:[2,1]}]);
 assert.equal(observe(r,0).turn,0);assert.equal(observe(r,0).round,2);assert.deepEqual(outcome(r).scores,[1,0]);
 assert.deepEqual([...r.hands.flat(),...r.history.flatMap(x=>x.cards)].sort((a,b)=>a-b),[1,2,3,4]);
 assert.throws(()=>step(r,commit(0,2)),RangeError);assert.throws(()=>step(initial,commit(0,3)),RangeError);
});
test('private observations hide opponent hand and pending values',()=>{
 const a=pocket(),b=pocket([2,4],[1,5]);assert.deepEqual(observe(a,0),observe(b,0));
 const lo=step(a,commit(0,2)),hi=step(a,commit(0,4));assert.deepEqual(observe(lo,1),observe(hi,1));
 assert.equal(observe(lo,0).pendingCard,2);assert.equal(observe(hi,0).pendingCard,4);
 const v=observe(lo,1);assert.deepEqual(Object.keys(v).sort(),['game','player','round','turn','hand','pendingCard','history','scores','outcome'].sort());
 assert.deepEqual(v.hand,[1,3]);assert.equal(v.pendingCard,null);assert.deepEqual(v.history,[]);
});
test('transitions and projections detach from frozen input',()=>{
 const initial=freezeDeep(pocket()),action=freezeDeep(commit(0,2)),key=stateKey(initial),pending=step(initial,action);
 assert.equal(stateKey(initial),key);assert.deepEqual(action,commit(0,2));
 const r=freezeDeep(step(pending,commit(1,1))),before=stateKey(r),baseline=observe(r,0),v=observe(r,0);
 v.hand.push(5);v.history[0].cards[0]=5;v.scores[0]=99;v.outcome.scores[0]=99;outcome(r).scores[1]=99;legalActions(r,0)[0].card=5;
 assert.equal(stateKey(r),before);assert.deepEqual(observe(r,0),baseline);assert.deepEqual(legalActions(r,0),[commit(0,4)]);
});
test('unordered hands canonicalize without mutating supplied order',()=>{
 const sorted=pocket(),r=structuredClone(sorted);r.hands.forEach(h=>h.reverse());const before=JSON.stringify(r);
 assert.equal(stateKey(r),stateKey(sorted));assert.deepEqual(legalActions(r,0),legalActions(sorted,0));assert.deepEqual(observe(r,0),observe(sorted,0));assert.equal(JSON.stringify(r),before);
});
test('malformed and unreachable states fail every state consumer',()=>{
 const cases=[{game:B,position:1,turn:0},{game:B,position:8,turn:0},{game:B,position:NaN,turn:0},{game:B,position:0,turn:'0'},{game:B,position:0,turn:0,target:9},
 {...pocket(),hands:[[2,4],[2,3]]},{...pocket(),hands:[[2,6],[1,3]]},{...pocket(),committed:[null,1]},{...pocket(),committed:[2,1]},
 {...pocket(),committed:[3,null]},{...pocket(),history:[{cards:[2,1]}]},{...pocket(),scores:[99,0]}];
 for(const s of cases)for(const consume of [s=>legalActions(s,0),s=>step(s,commit(0,2)),s=>observe(s,0),outcome,stateKey])assert.throws(()=>consume(s));
});
test('malformed action and player IDs cannot alter approved rules',()=>{
 const s=pocket(),before=stateKey(s),cases=[commit(1,1),commit(0,3),commit(0,0),commit(0,'2'),{...commit(0,2),approved:true},{type:'reveal',player:0,card:2},{type:'commit',player:0}];
 for(const a of cases){assert.throws(()=>step(s,a));assert.equal(stateKey(s),before);}
 for(const p of [-1,2,'0',null,true]){assert.throws(()=>legalActions(s,p),RangeError);assert.throws(()=>observe(s,p),RangeError);assert.throws(()=>step(s,commit(p,2)));}
 assert.throws(()=>initialStates('unapproved-game'),RangeError);
});
