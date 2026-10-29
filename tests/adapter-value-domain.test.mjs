import test from 'node:test';
import assert from 'node:assert/strict';
import * as game from '../src/games.js';
import {createAdapter,checkAdaptation} from '../src/adaptations.js';

const good=createAdapter('shape-text');
function withExtra(make){return {...good,observe(s,p){return {...good.observe(s,p),extra:make(s,p)};}};}
function rejected(candidate){
 const result=checkAdaptation('pocket-signals',candidate);
 assert.equal(result.ok,false);assert.equal(result.complete,false);
 assert.equal(result.verdict,'rejected');assert.equal(result.reason,'adapter-error');
 assert.match(result.counterexample.message,/JSON value trees/);
 return result;
}

test('a hidden hand carried in a Map cannot receive an equivalence certificate',()=>{
 const states=game.initialStates('pocket-signals');
 const a=states.find(s=>JSON.stringify(s.hands)==='[[1,2],[3,4]]');
 const b=states.find(s=>JSON.stringify(s.hands)==='[[1,2],[3,5]]');
 const candidate=withExtra((s,p)=>new Map([['hand',s.hands[1-p]]]));
 assert.deepEqual(game.observe(a,0),game.observe(b,0));
 assert.deepEqual(candidate.observe(a,0).extra.get('hand'),[3,4]);
 assert.deepEqual(candidate.observe(b,0).extra.get('hand'),[3,5]);
 assert.notDeepEqual(candidate.observe(a,0),candidate.observe(b,0));
 rejected(candidate);
});

test('JSON-erased values and structured-clone conversions are outside the supported domain',()=>{
 const unsupported=[
  ()=>undefined,()=>NaN,()=>Infinity,()=>-Infinity,()=>-0,()=>1n,()=>Symbol('choice'),
  ()=>new Map(),()=>new Set(),()=>new Date(0),()=>new Uint8Array([1]),
  ()=>new (class Observation{constructor(){this.value=1;}})(),
  ()=>{const value={};value.self=value;return value;},
  ()=>{const child={value:1};return {left:child,right:child};},
  ()=>Array(1),()=>Object.assign([1],{extra:2}),
  ()=>Object.defineProperty({},'hidden',{value:1}),
  ()=>({[Symbol('hidden')]:1})
 ];
 for(const make of unsupported)rejected(withExtra(make));
 let reads=0;
 rejected(withExtra(()=>Object.defineProperty({},'value',{enumerable:true,get(){reads++;return 1;}})));
 assert.equal(reads,0,'validation must reject accessors without invoking them');
});

test('every authored return channel is checked before cloning can discard properties',()=>{
 for(const method of ['actions','decode','step','observe','outcome']){
  const candidate={...good,[method](...args){
   const value=good[method](...args);
   Object.defineProperty(value,Symbol('unrepresentable'),{value:'hidden'});
   return value;
  }};
  rejected(candidate);
 }
});

test('value-equivalent plain data remains accepted and actual plain-data leakage stays rejected',()=>{
 const safe=withExtra(()=>Object.assign(Object.create(null),{text:'constant',number:0,flag:true,nil:null,list:[1,{name:'same'}]}));
 const result=checkAdaptation('pocket-signals',safe);
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.complete,true);
 assert.equal(result.states,450);assert.equal(result.transitions,420);
 const leak=checkAdaptation('pocket-signals',withExtra((s,p)=>({hand:[...s.hands[1-p]]})));
 assert.equal(leak.reason,'information-leak');assert.equal(leak.ok,false);
 assert.deepEqual(leak.counterexample.left.baseView,leak.counterexample.right.baseView);
 assert.notDeepEqual(leak.counterexample.left.adaptedView,leak.counterexample.right.adaptedView);
});
