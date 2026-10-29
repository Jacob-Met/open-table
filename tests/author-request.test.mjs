import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAuthorRequest,AUTHORING_INSTRUCTIONS,MAX_AUTHOR_GOAL_LENGTH} from '../src/author-request.js';
import {getCatalog} from '../src/catalog.js';
import {makeModelRequest} from '../src/model-experiment.js';

test('author text is preserved exactly in a bounded local request',()=>{
 const goal='  I use one switch.\nLet me confirm when ready — ◇ 🎲  ';
 const request=prepareAuthorRequest('pocket-signals',goal),body=JSON.parse(request.messages[1].content);
 assert.equal(request.schema,'open-table.authoring-request.v1');
 assert.equal(request.accessGoal,goal);assert.equal(body.accessGoal,goal);
 assert.deepEqual(request.messages.map(m=>m.role),['system','user']);
 assert.equal(request.messages[0].content,AUTHORING_INSTRUCTIONS);
 assert.deepEqual(Object.keys(request),['schema','gameId','rulesetPin','accessGoal','messages']);
 assert.deepEqual(Object.keys(body),['accessGoal','approvedCatalog']);
 assert.deepEqual(Object.keys(body.approvedCatalog),['gameId','title','rulesetPin','rules','components','adapters','sourceRefs','fixtures']);
});
test('invalid and excessive access needs cannot produce a request',()=>{
 for(const goal of ['', ' \t\n ',null,undefined,0,{},[],new String('need')])
  assert.throws(()=>prepareAuthorRequest('beacon-steps',goal),/1 to 2,000/);
 assert.equal(prepareAuthorRequest('beacon-steps','x'.repeat(MAX_AUTHOR_GOAL_LENGTH)).accessGoal.length,2000);
 assert.throws(()=>prepareAuthorRequest('beacon-steps','x'.repeat(2001)),/1 to 2,000/);
 assert.equal(prepareAuthorRequest('beacon-steps','🎲'.repeat(1000)).accessGoal.length,2000);
 assert.throws(()=>prepareAuthorRequest('beacon-steps','🎲'.repeat(1000)+'x'),/1 to 2,000/);
});
test('only known current authored game catalogs are exported',()=>{
 for(const game of ['beacon-steps','pocket-signals']){
  const c=getCatalog(game),r=prepareAuthorRequest(game,'A clear label for each available choice.');
  assert.equal(r.gameId,game);assert.equal(r.rulesetPin,c.rulesetPin);
  assert.deepEqual(JSON.parse(r.messages[1].content).approvedCatalog,{gameId:c.gameId,title:c.title,rulesetPin:c.rulesetPin,rules:c.rules,components:c.components,adapters:c.adapters,sourceRefs:c.sourceRefs,fixtures:c.fixtures});
  for(const key of ['caseId','split','expected','state','hands','history','savedMatch','provider','model'])assert.equal(Object.hasOwn(r,key),false);
 }
 for(const game of ['unknown','__proto__','constructor',null,{}])assert.throws(()=>prepareAuthorRequest(game,'A clear label.'));
});
test('callers cannot mutate future requests or the shared catalog',()=>{
 const r=prepareAuthorRequest('pocket-signals','Original need'),body=JSON.parse(r.messages[1].content);
 r.messages[0].content='changed';body.approvedCatalog.rules[0].text='changed';r.accessGoal='changed';
 const fresh=prepareAuthorRequest('pocket-signals','Original need');
 assert.equal(fresh.messages[0].content,AUTHORING_INSTRUCTIONS);
 assert.notEqual(JSON.parse(fresh.messages[1].content).approvedCatalog.rules[0].text,'changed');
 assert.equal(fresh.accessGoal,'Original need');
});
test('explicit author text is text, never executed or silently redacted',()=>{
 const goal='<img src=x onerror="alert(1)">\nMy authored sentinel: private-card-XYZ';
 const r=prepareAuthorRequest('beacon-steps',goal);
 assert.equal(JSON.parse(r.messages[1].content).accessGoal,goal);
 assert.equal(JSON.parse(JSON.stringify(r)).accessGoal,goal);
});
test('development requests reuse the same instruction and payload without user-request metadata',()=>{
 for(const id of ['beacon-colour-independent','beacon-one-switch','pocket-private-reading','pocket-one-switch']){
  const benchmark=makeModelRequest(id);assert.equal(benchmark.split,'development');
  const goal=JSON.parse(benchmark.messages[1].content).accessGoal;
  assert.deepEqual(benchmark.messages,prepareAuthorRequest(benchmark.gameId,goal).messages);
  assert.deepEqual(Object.keys(benchmark),['experimentVersion','caseId','split','gameId','rulesetPin','messages']);
 }
});
