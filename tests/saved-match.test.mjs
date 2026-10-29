import test from 'node:test';
import assert from 'node:assert/strict';
import {initialStates,legalActions,step,stateKey} from '../src/games.js';
import {SAVED_MATCH_KEY,encodeSavedMatch,decodeSavedMatch,inspectSavedMatch,saveStoredMatch,clearStoredMatch} from '../src/saved-match.js';
const TIME='2026-10-29T12:00:00.000Z';
const firstState=(gameId='beacon-steps')=>Array.from(initialStates(gameId))[0];
const match=(state=firstState(),adapter='shape-text')=>({gameId:state.game,state,adapter});
const rawSave=(state=firstState(),adapter='shape-text')=>encodeSavedMatch(match(state,adapter),TIME);
function memoryStorage(initial=null){
 const data=new Map();if(initial!==null)data.set(SAVED_MATCH_KEY,initial);
 return {data,getItem(key){return data.has(key)?data.get(key):null;},setItem(key,value){data.set(key,String(value));},removeItem(key){data.delete(key);}};
}
const throwsCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
function altered(raw,mutate){const record=JSON.parse(raw);mutate(record);return JSON.stringify(record);}
function reachableStates(gameId){
 const queue=Array.from(initialStates(gameId)),seen=new Map();
 for(let i=0;i<queue.length;i++){
  const state=queue[i],key=stateKey(state);if(seen.has(key))continue;seen.set(key,state);
  assert.ok(seen.size<=100000,'Unexpected reachable-state expansion');
  for(const player of [0,1])for(const action of legalActions(state,player))queue.push(step(state,action));
 }
 return [...seen.values()];
}
for(const gameId of ['beacon-steps','pocket-signals'])test(gameId+': every reachable state round-trips',()=>{
 const states=reachableStates(gameId);assert.equal(states.length,gameId==='beacon-steps'?14:450);
 for(const state of states)for(const adapter of ['shape-text','switch-select']){
  const raw=encodeSavedMatch(match(state,adapter),TIME),record=decodeSavedMatch(raw);
  assert.equal(record.gameId,gameId);assert.equal(record.adapter,adapter);assert.equal(record.savedAt,TIME);
  assert.equal(stateKey(record.state),stateKey(state));assert.notEqual(record.state,state);
  assert.equal(encodeSavedMatch(match(record.state,adapter),TIME),raw);
  assert.deepEqual(Object.keys(record),['schema','gameId','rulesetPin','savedAt','adapter','state']);
 }
});
test('decoded nested state is detached from source and other decodes',()=>{
 const state=firstState('pocket-signals'),before=stateKey(state),raw=rawSave(state),first=decodeSavedMatch(raw),second=decodeSavedMatch(raw);
 first.state.hands[0].push(99);assert.equal(stateKey(state),before);assert.equal(stateKey(second.state),before);
});
test('rejects malformed, incompatible and cross-game records',()=>{
 const raw=rawSave(),cases=[
  [null,'INVALID_RECORD'],['{','INVALID_JSON'],['null','INVALID_RECORD'],['[]','INVALID_RECORD'],[' '.repeat(65537),'RECORD_TOO_LARGE'],
  [altered(raw,r=>{r.extra=true;}),'INVALID_RECORD'],[altered(raw,r=>{delete r.adapter;}),'INVALID_RECORD'],
  [altered(raw,r=>{r.schema='future';}),'UNSUPPORTED_VERSION'],[altered(raw,r=>{r.gameId='unknown';}),'INVALID_GAME'],
  [altered(raw,r=>{r.rulesetPin='stale';}),'RULESET_MISMATCH'],[altered(raw,r=>{r.savedAt='yesterday';}),'INVALID_TIME'],
  [altered(raw,r=>{r.adapter='unknown';}),'INVALID_ADAPTER'],[altered(raw,r=>{r.state=firstState('pocket-signals');}),'INVALID_STATE'],
  [altered(raw,r=>{r.state.position=8;}),'INVALID_STATE'],[altered(raw,r=>{r.state.position=0.5;}),'INVALID_STATE'],
  [altered(raw,r=>{r.state.position=0;r.state.turn=1;}),'INVALID_STATE'],[altered(raw,r=>{r.state.extra=true;}),'INVALID_STATE']];
 for(const [candidate,code] of cases)throwsCode(()=>decodeSavedMatch(candidate),code);
 throwsCode(()=>decodeSavedMatch(raw.replace('"position":0','"position":1e309')),'INVALID_STATE');
});
test('rejects invalid Pocket Signals conservation and commitments',()=>{
 const raw=rawSave(firstState('pocket-signals'));
 for(const mutate of [r=>{r.state.hands[1][0]=r.state.hands[0][0];},r=>{r.state.hands[0].pop();},r=>{r.state.hands[0][0]=6;},r=>{r.state.committed[0]=99;},r=>{r.state.committed[1]=r.state.hands[1][0];},r=>{r.state.history=[{cards:[1,2]}];}])throwsCode(()=>decodeSavedMatch(altered(raw,mutate)),'INVALID_STATE');
});
test('inspection distinguishes empty, ready, invalid and unavailable',()=>{
 assert.deepEqual(inspectSavedMatch(memoryStorage()),{status:'empty',raw:null});
 assert.equal(inspectSavedMatch(memoryStorage(rawSave())).status,'ready');
 const bad=memoryStorage('{'),result=inspectSavedMatch(bad);
 assert.equal(result.status,'invalid');assert.equal(result.raw,'{');assert.equal(bad.getItem(SAVED_MATCH_KEY),'{');
 assert.equal(inspectSavedMatch({getItem(){throw Error('Denied');}}).status,'unavailable');
});
test('save verifies exact bytes; clear removes only its own key',()=>{
 const storage=memoryStorage();storage.setItem('unrelated','keep');
 const record=saveStoredMatch(storage,match(),null),raw=storage.getItem(SAVED_MATCH_KEY);
 assert.deepEqual(decodeSavedMatch(raw),record);assert.deepEqual(clearStoredMatch(storage,raw),{status:'empty',raw:null});
 assert.equal(storage.getItem(SAVED_MATCH_KEY),null);assert.equal(storage.getItem('unrelated'),'keep');
});
test('expected record is mandatory; changed records prevent effects',()=>{
 const raw=rawSave(),storage=memoryStorage(raw);
 for(const fn of [()=>saveStoredMatch(storage,match()),()=>clearStoredMatch(storage)])throwsCode(fn,'EXPECTED_RECORD_REQUIRED');
 for(const fn of [()=>saveStoredMatch(storage,match(),null),()=>clearStoredMatch(storage,null),()=>saveStoredMatch(storage,match(),'old'),()=>clearStoredMatch(storage,'old')]){
  throwsCode(fn,'RECORD_CHANGED');assert.equal(storage.getItem(SAVED_MATCH_KEY),raw);
 }
});
test('denied preflight read prevents write and removal',()=>{
 const storage={getItem(){throw Error('Denied');},setItem(){assert.fail('Must not write');},removeItem(){assert.fail('Must not remove');}};
 throwsCode(()=>saveStoredMatch(storage,match(),null),'STORAGE_UNAVAILABLE');throwsCode(()=>clearStoredMatch(storage,null),'STORAGE_UNAVAILABLE');
});
test('quota refusal retains existing record',()=>{
 const raw=rawSave(),storage=memoryStorage(raw);storage.setItem=()=>{throw Error('Quota exceeded');};
 throwsCode(()=>saveStoredMatch(storage,match(),raw),'WRITE_REFUSED');assert.equal(storage.getItem(SAVED_MATCH_KEY),raw);
});
test('removal refusal retains existing record',()=>{
 const raw=rawSave(),storage=memoryStorage(raw);storage.removeItem=()=>{throw Error('Denied');};
 throwsCode(()=>clearStoredMatch(storage,raw),'REMOVE_REFUSED');assert.equal(storage.getItem(SAVED_MATCH_KEY),raw);
});
test('post-write denied read reports uncertainty without rollback',()=>{
 const storage=memoryStorage(),nativeSet=storage.setItem.bind(storage);
 storage.setItem=(key,value)=>{nativeSet(key,value);storage.getItem=()=>{throw Error('Denied after write');};};
 throwsCode(()=>saveStoredMatch(storage,match(),null),'SAVE_UNVERIFIED');assert.ok(storage.data.has(SAVED_MATCH_KEY));
 assert.equal(decodeSavedMatch(storage.data.get(SAVED_MATCH_KEY)).gameId,'beacon-steps');
});
test('post-write mismatch preserves competing record',()=>{
 const storage=memoryStorage();storage.setItem=key=>{storage.data.set(key,'changed elsewhere');};
 throwsCode(()=>saveStoredMatch(storage,match(),null),'SAVE_UNVERIFIED');assert.equal(storage.getItem(SAVED_MATCH_KEY),'changed elsewhere');
});
test('post-clear denied read reports uncertainty without restoration',()=>{
 const raw=rawSave(),storage=memoryStorage(raw),nativeRemove=storage.removeItem.bind(storage);
 storage.removeItem=key=>{nativeRemove(key);storage.getItem=()=>{throw Error('Denied after removal');};};
 throwsCode(()=>clearStoredMatch(storage,raw),'CLEAR_UNVERIFIED');assert.equal(storage.data.has(SAVED_MATCH_KEY),false);
});
test('post-clear mismatch preserves competing record',()=>{
 const raw=rawSave(),storage=memoryStorage(raw);storage.removeItem=key=>{storage.data.set(key,'changed elsewhere');};
 throwsCode(()=>clearStoredMatch(storage,raw),'CLEAR_UNVERIFIED');assert.equal(storage.getItem(SAVED_MATCH_KEY),'changed elsewhere');
});
test('invalid source state cannot touch storage',()=>{
 const storage={getItem(){assert.fail('Validation must precede storage access');},setItem(){assert.fail('Must not write');}};
 throwsCode(()=>saveStoredMatch(storage,match({game:'beacon-steps',position:0,turn:1}),null),'INVALID_STATE');
});
