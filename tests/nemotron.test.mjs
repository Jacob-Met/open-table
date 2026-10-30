import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppServer} from '../server.mjs';
import {callNemotron,proposeAdaptation,nemotronConfig,stripFence,NEBIUS_BASE_URL,ProposalError} from '../src/nemotron.js';

import {RULESET_PINS} from '../src/ruleset-pins.js';
// A valid answer for Beacon Steps, built from the authored catalog so it passes the same parser.
const validProposal=(extra={})=>JSON.stringify({schema:'open-table.proposal.v1',gameId:'beacon-steps',
 rulesetPin:RULESET_PINS['beacon-steps'],classification:'equivalence-candidate',summary:'Name the marker and the goal in words and shapes.',
 changes:[{adapter:'shape-text',componentRef:'public.position',sourceRefs:['beacon.rule.public'],rationale:'Adds a word and a shape for the marker.'}],
 witnessCandidates:[],...extra});

function fakeFetch(...answers){
 const calls=[];
 const fetchImpl=async(url,init)=>{
  calls.push({url,init,body:JSON.parse(init.body)});
  const next=answers.shift();
  if(next instanceof Error) throw next;
  return new Response(JSON.stringify(next),{status:200,headers:{'Content-Type':'application/json'}});
 };
 return {fetchImpl,calls};
}
const reply=content=>({model:'nvidia/nemotron-3-super-120b-a12b',choices:[{message:{content,reasoning_content:'hidden'}}]});
const config={apiKey:'test-key-not-real',model:'nvidia/nemotron-3-super-120b-a12b',baseUrl:NEBIUS_BASE_URL};
const need={gameId:'beacon-steps',accessGoal:'Name the marker and the goal in words and shapes.'};

test('without a key the adapter makes no network call and says so', async()=>{
 const {fetchImpl,calls}=fakeFetch();
 await assert.rejects(proposeAdaptation(need,{config:{...config,apiKey:''},fetchImpl}),err=>err instanceof ProposalError&&err.code==='unconfigured'&&/NEBIUS_API_KEY/.test(err.message));
 assert.equal(calls.length,0);
});

test('request goes to Token Factory with the Nemotron model and reads message content only', async()=>{
 const {fetchImpl,calls}=fakeFetch(reply(validProposal()));
 const result=await proposeAdaptation(need,{config,fetchImpl});
 assert.equal(calls[0].url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
 assert.equal(calls[0].init.headers.Authorization,'Bearer test-key-not-real');
 assert.equal(calls[0].body.model,'nvidia/nemotron-3-super-120b-a12b');
 assert.ok(calls[0].body.max_tokens>=1500);
 assert.equal(calls[0].body.messages[0].role,'system');
 assert.ok(!JSON.stringify(calls[0].body).includes('test-key-not-real'));
 assert.equal(result.attempts,1);
 assert.deepEqual(result.checks.map(c=>c.pack),['shape-text']);
 assert.equal(result.checks[0].result.verdict,'equivalent');
 assert.equal(result.checks[0].result.complete,true);
});

test('a failed check gets one repair turn, then the validator decides', async()=>{
 const {fetchImpl,calls}=fakeFetch(reply('{"schema":"wrong"}'),reply('```json\n'+validProposal()+'\n```'));
 const result=await proposeAdaptation(need,{config,fetchImpl});
 assert.equal(calls.length,2);
 assert.equal(result.attempts,2);
 assert.equal(result.proposal.changes[0].componentRef,'public.position');
});

test('two invalid answers are refused and nothing is checked', async()=>{
 const {fetchImpl}=fakeFetch(reply('not json'),reply(validProposal({certified:true})));
 await assert.rejects(proposeAdaptation(need,{config,fetchImpl}),err=>err.code==='invalid');
});

test('an upstream or network failure reports itself without the key', async()=>{
 const http=async()=>new Response('nope',{status:401});
 await assert.rejects(proposeAdaptation(need,{config,fetchImpl:http}),err=>err.code==='upstream'&&!err.message.includes('test-key'));
 await assert.rejects(proposeAdaptation(need,{config,fetchImpl:async()=>{throw new TypeError('offline');}}),err=>err.code==='network'&&!err.message.includes('test-key'));
});

test('unknown games and empty needs are refused before any call', async()=>{
 const {fetchImpl,calls}=fakeFetch();
 await assert.rejects(proposeAdaptation({gameId:'other',accessGoal:'x'},{config,fetchImpl}),err=>err.code==='input');
 await assert.rejects(proposeAdaptation({gameId:'beacon-steps',accessGoal:'   '},{config,fetchImpl}),err=>err.code==='input');
 assert.equal(calls.length,0);
});

test('stripFence removes one JSON fence and leaves plain JSON alone', ()=>{
 assert.equal(stripFence('```json\n{"a":1}\n```'),'{"a":1}');
 assert.equal(stripFence(' {"a":1} '),'{"a":1}');
 assert.equal(nemotronConfig({}).model,'nvidia/nemotron-3-super-120b-a12b');
});

test('POST /api/propose returns 503 without a key and never reaches the network', async()=>{
 const {fetchImpl,calls}=fakeFetch();
 const server=createAppServer({env:{},fetchImpl});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/propose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(need)});
  assert.equal(response.status,503);
  assert.equal((await response.json()).live,false);
  assert.equal(calls.length,0);
  const wrongType=await fetch(base+'/api/propose',{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'});
  assert.equal(wrongType.status,415);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
 }finally{ await new Promise(r=>server.close(r)); }
});

test('POST /api/propose with a key returns the checked proposal', async()=>{
 const {fetchImpl}=fakeFetch(reply(validProposal()));
 const server=createAppServer({env:{NEBIUS_API_KEY:'test-key-not-real'},fetchImpl});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/propose',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(need)});
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.live,true);
  assert.equal(body.checks[0].result.states,14);
  assert.ok(!JSON.stringify(body).includes('test-key-not-real'));
 }finally{ await new Promise(r=>server.close(r)); }
});
