import test from 'node:test';
import assert from 'node:assert/strict';
import {createPack,importPack} from '../src/pack.js';
import {getCatalog} from '../src/catalog.js';
test('pack export and reopening run the actual finite checker for each approved mode',()=>{
 for(const game of ['beacon-steps','pocket-signals'])for(const mode of ['shape-text','switch-select']){
  const text=createPack(game,mode),raw=JSON.parse(text),r=importPack(text);
  assert.deepEqual(Object.keys(raw).sort(),['adapter','classification','gameId','rulesetPin','schema'].sort());
  assert.equal(r.gameId,game);assert.equal(r.adapter,mode);assert.equal(r.check.ok,true);assert.equal(r.check.complete,true);
  assert.equal(r.check.states,game==='beacon-steps'?14:450);
  assert.equal(r.check.transitions,game==='beacon-steps'?22:420);
  assert.equal(Object.hasOwn(r.check,'counterexample'),false);
 }
});
test('import cannot restore secrets, trust imported evidence or change rules',()=>{
 const base=JSON.parse(createPack('pocket-signals','shape-text'));
 for(const mutate of [
  p=>p.hands=[[2,4],[1,3]],p=>p.stateKey='hidden',p=>p.check={ok:true},
  p=>p.rulesetPin='sha256:'+'0'.repeat(64),p=>p.classification='variant',
  p=>p.adapter='reveal-opponent',p=>p.adapter='drop-action',p=>p.player=1,
  p=>p.schema='wrong',p=>delete p.gameId
 ]){const p=structuredClone(base);mutate(p);assert.throws(()=>importPack(JSON.stringify(p)));}
 assert.throws(()=>importPack('not json'));
 assert.throws(()=>createPack('beacon-steps','reveal-opponent'));
});
test('catalog is detached, referenced components exist, synthetic descriptions contain no states',()=>{
 const c=getCatalog('pocket-signals');assert.match(c.rulesetPin,/^sha256:[a-f0-9]{64}$/);
 for(const refs of Object.values(c.adapters))for(const ref of refs)assert.ok(c.components.some(x=>x.ref===ref));
 for(const f of c.fixtures)assert.deepEqual(Object.keys(f).sort(),['description','ref']);
 c.rules[0].text='mutated';assert.notEqual(getCatalog('pocket-signals').rules[0].text,'mutated');
});
