import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';
// Normal UI, actual files, DOM and Chrome accessibility-tree observations only.
// Does not establish screen-reader speech output or human usability.
const options={};
for(let i=2;i<process.argv.length;i+=2){const k=process.argv[i],v=process.argv[i+1];assert.ok(['--file','--output'].includes(k)&&v&&!options[k]);options[k]=v;}
assert.ok(options['--file']&&options['--output']);assert.notEqual(process.getuid?.(),0);
const file=resolve(options['--file']),output=resolve(options['--output']);await mkdir(output);
const downloads=join(output,'downloads');await mkdir(downloads);
const original=await readFile(file),sha=x=>createHash('sha256').update(x).digest('hex');
const receipt={schema:'open-table.input-feedback-receiving.v1',startedAt:new Date().toISOString(),entry:file,artifact:{bytes:original.length,sha256:sha(original)},networkOfflineBeforeNavigation:true,cases:[],limitations:['Chrome accessibility-tree and DOM feedback qualification; no screen-reader speech-output, physical-device or human-usability claim.','Original finite-game prototype; no model inference, universal accessibility or secure-multiplayer claim.']};
let b;
const read=s=>b.evaluate(s),text=s=>read('document.querySelector('+JSON.stringify(s)+')?.textContent||""'),count=s=>read('document.querySelectorAll('+JSON.stringify(s)+').length');
const staged=()=>read('document.querySelector("#proposal-json").value');
async function wait(f){for(let i=0;i<100;i++){if(await f())return;await delay(50);}throw Error('condition timeout');}
async function check(name,fn){const r={name};receipt.cases.push(r);try{r.evidence=await fn();r.passed=true;}catch(e){r.passed=false;r.failure=e.stack;throw e;}}
async function liveNode(){
 const {root}=await b.send('DOM.getDocument');const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-testid=public-live]'});
 const {node}=await b.send('DOM.describeNode',{nodeId,depth:1});return node.children?.[0]?.backendNodeId;
}
async function feedback(expected){
 assert.equal(await text('[data-testid=public-live]'),expected);
 const {nodes}=await b.send('Accessibility.getFullAXTree'),live=nodes.find(n=>n.role?.value==='status');
 assert.ok(live);assert.ok(live.properties.some(p=>p.name==='live'&&p.value.value==='polite'));
 assert.ok(nodes.some(n=>live.childIds?.includes(n.nodeId)&&n.name?.value===expected),'Live status must carry the feedback in the accessibility tree');
 return {text:expected,role:live.role.value,politeness:'polite'};
}
async function draftError(){
 const error=await text('#proposal-error');assert.ok(error);
 assert.equal(await read('document.querySelector("#proposal-json").getAttribute("aria-invalid")'),'true');
 assert.equal(await read('document.querySelector("#proposal-json").getAttribute("aria-describedby")'),'proposal-error');
 assert.equal(await count('.proposal-preview .proposal-buttons button'),0);
 const {nodes}=await b.send('Accessibility.getFullAXTree'),input=nodes.find(n=>n.role?.value==='textbox'&&n.name?.value==='Staged proposal JSON');
 assert.ok(input?.properties?.some(p=>p.name==='invalid'&&String(p.value.value)==='true'));
 return feedback('Proposal not ready. '+error);
}
async function clearError(){
 assert.equal(await count('#proposal-error'),0);
 assert.equal(await read('document.querySelector("#proposal-json").getAttribute("aria-invalid")'),null);
 assert.equal(await read('document.querySelector("#proposal-json").getAttribute("aria-describedby")'),null);
}
async function replaceDraft(value){await b.click('#proposal-json');await read('document.querySelector("#proposal-json").select();true');await b.send('Input.insertText',{text:value});assert.equal(await staged(),value);}
async function review(){await read('document.querySelector("#validate-proposal").focus();true');await b.key('Enter');assert.equal(await read('document.activeElement.id'),'validate-proposal');}
async function reopen(path,success){
 await b.click('#open-pack');const {root}=await b.send('DOM.getDocument');const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
 await b.send('DOM.setFileInputFiles',{nodeId,files:[path]});
 await wait(async()=>{const x=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});return x.nodeId&&x.nodeId!==nodeId;});
 assert.match(await text('[data-testid=pack-status]'),success?/checked again/:/Could not open pack/);
}
try{
 b=await launchBrowser({filePath:file,artifactRoot:dirname(file),offline:true,screenshotDir:output});
 receipt.browser=await b.send('Browser.getVersion');receipt.sandboxRequired=true;
 await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});await b.click('#save-pack');
 let name;await wait(async()=>{name=(await readdir(downloads)).find(n=>n.endsWith('.open-table.json'));return !!name;});
 const pack=join(downloads,name),invalid=join(downloads,'invalid.json');await writeFile(invalid,'not JSON');
 let first;
 await check('Rejected pack reports exact visible error through polite accessible status',async()=>{
  await reopen(invalid,false);assert.equal(await read('document.activeElement.id'),'open-pack');
  const error=await text('[data-testid=pack-status]'),e=await feedback(error);first=await liveNode();assert.ok(first);return e;
 });
 await check('Repeated identical pack rejection refreshes the live text node',async()=>{
  await reopen(invalid,false);const e=await feedback(await text('[data-testid=pack-status]'));const next=await liveNode();assert.ok(next);assert.notEqual(next,first);return {...e,textNodeRefreshed:true};
 });
 await check('A later valid actual pack clears failure feedback without changing game',async()=>{
  await reopen(pack,true);assert.equal(await text('#table-title'),'Beacon Steps');
  return feedback('Adaptation pack reopened. Private cards are covered.');
 });
 await b.click('#workshop-tab');
 await check('Rejected keyboard proposal review exposes invalid state and error association',async()=>{
  await replaceDraft('not JSON');await review();assert.equal(await staged(),'not JSON');const e=await draftError();first=await liveNode();return {...e,draftRetained:true};
 });
 await check('Repeated identical proposal rejection refreshes accessible feedback',async()=>{
  await review();const e=await draftError();assert.notEqual(await liveNode(),first);return {...e,textNodeRefreshed:true};
 });
 await check('Editing the draft clears stale invalid state and error association',async()=>{
  await replaceDraft('unfinished replacement');await clearError();assert.equal(await count('.proposal-preview .proposal-buttons button'),0);
  return {draftRetained:true,errorAndInvalidStateCleared:true};
 });
 await check('Loading an authored example clears the error and announces required review',async()=>{
  await review();await draftError();await b.click('#load-example');await clearError();assert.equal(await count('.proposal-preview .proposal-buttons button'),0);
  return feedback('Authored example loaded. Review it before approving.');
 });
 await check('Candidate success requests author review without self-certifying or auto-checking',async()=>{
  await review();await clearError();assert.equal(await count('.proposal-preview .proposal-buttons button'),1);assert.equal(await count('#lab-result'),0);
  const e=await feedback('Candidate ready for author review. Approve a mode to run its independent check.');
  await b.click('.proposal-preview .proposal-buttons button');assert.equal(await text('[data-testid=checked-game]'),'Checked game: Beacon Steps');return {...e,independentCheckRequiresApproval:true};
 });
 await check('Variant review announces non-preserving status and supplies no approval control',async()=>{
  const value=JSON.parse(await staged());value.classification='variant';await replaceDraft(JSON.stringify(value,null,2));await review();await clearError();
  assert.equal(await count('.proposal-preview .proposal-buttons button'),0);
  return feedback('Variant idea reviewed. It cannot activate as a preserving access pack.');
 });
 await check('Wrong-game proposal rejection retains authored text and clears stale variant feedback',async()=>{
  const value=JSON.parse(await staged());value.gameId='pocket-signals';const raw=JSON.stringify(value,null,2);await replaceDraft(raw);await review();assert.equal(await staged(),raw);
  return draftError();
 });
 assert.equal(receipt.cases.length,10);receipt.ok=true;
}catch(e){receipt.ok=false;receipt.failure=e.stack;process.exitCode=1;}
finally{
 if(b){
  receipt.browserErrors=[...b.errors];receipt.requests=[...b.requests];
  try{assert.deepEqual(receipt.browserErrors,[]);const entry=new URL(b.entryURL);entry.hash='';entry.search='';receipt.forbiddenRequests=receipt.requests.filter(r=>{const u=new URL(r.url);if(['blob:','data:','about:'].includes(u.protocol))return false;u.hash='';u.search='';return u.href!==entry.href;});assert.deepEqual(receipt.forbiddenRequests,[]);assert.deepEqual(await readFile(file),original);receipt.artifactUnchanged=true;}catch(e){receipt.ok=false;receipt.evidenceFailure=e.stack;process.exitCode=1;}
  try{await b.close();receipt.browserClosed=true;}catch(e){receipt.ok=false;receipt.cleanupFailure=e.stack;process.exitCode=1;}
 }
 receipt.finishedAt=new Date().toISOString();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
