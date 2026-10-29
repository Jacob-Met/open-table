import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';

// Ordinary UI only: actual downloads/reopens, rendered text, clicks and text input.
// No app state injection, hidden-hand reads, fake proposal parsing or inference.
const options={};
for(let i=2;i<process.argv.length;i+=2){
 const k=process.argv[i],v=process.argv[i+1];
 assert.ok(['--file','--output'].includes(k)&&v&&!options[k],'Expected unique --file/--output values');options[k]=v;
}
assert.ok(options['--file']&&options['--output'],'Supply --file and --output');
assert.notEqual(process.getuid?.(),0,'Browser sandbox requires a non-root user');
const file=resolve(options['--file']),output=resolve(options['--output']);
await mkdir(output);const downloads=join(output,'downloads');await mkdir(downloads);
const original=await readFile(file),sha=x=>createHash('sha256').update(x).digest('hex');
const receipt={schema:'open-table.proposal-import-receiving.v1',startedAt:new Date().toISOString(),entry:file,artifact:{bytes:original.length,sha256:sha(original)},networkOfflineBeforeNavigation:true,checks:[],observations:[],limitations:['Normal Chrome on Linux, not physical-device or assistive-technology qualification.','Finite fixed adaptations only; no provider inference or universal accessibility claim.','Trusted-device pass-and-play, not secure multiplayer.']};
let b;
const evaluate=s=>b.evaluate(s);
const text=s=>evaluate('document.querySelector('+JSON.stringify(s)+')?.textContent||""');
const count=s=>evaluate('document.querySelectorAll('+JSON.stringify(s)+').length');
const staged=()=>evaluate('document.querySelector("#proposal-json").value');
const preview=()=>text('.proposal-preview');
const approvals=()=>count('.proposal-preview .proposal-buttons button');
const selected=()=>evaluate('document.querySelector("[data-game][aria-pressed=true]").dataset.game');
const publicBoard=()=>text('[data-testid=board]');
async function wait(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(50);}throw new Error('Condition timed out');}
async function check(name,fn){const r={name};receipt.observations.push(r);try{r.evidence=await fn();r.passed=true;receipt.checks.push(name);}catch(e){r.passed=false;r.error=e.stack;throw e;}}
async function reopen(path,success=true){
 await b.click('#open-pack');
 const {root}=await b.send('DOM.getDocument');
 const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
 assert.ok(nodeId);await b.send('DOM.setFileInputFiles',{nodeId,files:[path]});
 await wait(async()=>{
  const current=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
  if(!current.nodeId||current.nodeId===nodeId)return false;
  return success?/checked again/.test(await text('[data-testid=pack-status]')):/Could not open pack/.test(await text('[data-testid=pack-status]'));
 });
}
async function save(game){
 await b.click('[data-game="'+game+'"]');await b.click('#save-pack');
 const expected=game+'-shape-text.open-table.json';await wait(async()=>(await readdir(downloads)).includes(expected));
 const path=join(downloads,expected),bytes=await readFile(path),pack=JSON.parse(bytes);
 assert.equal(pack.gameId,game);assert.deepEqual(Object.keys(pack).sort(),['adapter','classification','gameId','rulesetPin','schema'].sort());
 return {path,bytes:bytes.length,sha256:sha(bytes)};
}
async function ownHandCovered(){
 assert.equal(await count('[data-testid=private-hand],#private-title,.playing-card'),0);
 assert.doesNotMatch(await text('[data-testid=public-live]'),/Commit card|Own hand:|Leaked opponent|Card \d/i);
}
async function replaceDraft(value){
 await b.click('#proposal-json');
 await evaluate('document.querySelector("#proposal-json").select();true');
 await b.send('Input.insertText',{text:value});
 assert.equal(await staged(),value);
}
try{
 b=await launchBrowser({filePath:file,artifactRoot:dirname(file),offline:true,screenshotDir:output});
 receipt.browser=await b.send('Browser.getVersion');receipt.sandboxRequired=true;
 await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
 const pocket=await save('pocket-signals'),beacon=await save('beacon-steps');receipt.downloads=[pocket,beacon];
 let draft,review,board;
 await check('Same-game reopen retains reviewed proposal and progressed match',async()=>{
  await b.click('[data-choice="1"]');board=await publicBoard();
  await b.click('#workshop-tab');await b.click('#load-example');await b.click('#validate-proposal');
  draft=await staged();review=await preview();assert.equal(JSON.parse(draft).gameId,'beacon-steps');assert.equal(await approvals(),1);
  await b.click('#play-tab');await reopen(beacon.path);assert.equal(await publicBoard(),board);
  await b.click('#workshop-tab');assert.equal(await staged(),draft);assert.equal(await preview(),review);assert.equal(await approvals(),1);
  return {sameGame:'beacon-steps',reviewRetained:true,progressRetained:true};
 });
 await check('Rejected import retains reviewed proposal and match',async()=>{
  const invalid=join(downloads,'invalid.json');await writeFile(invalid,'not JSON\n');
  await b.click('#play-tab');await reopen(invalid,false);assert.equal(await selected(),'beacon-steps');assert.equal(await publicBoard(),board);
  await b.click('#workshop-tab');assert.equal(await staged(),draft);assert.equal(await preview(),review);assert.equal(await approvals(),1);
  return {reviewRetained:true,progressRetained:true};
 });
 await check('Cross-game reopen preserves draft but invalidates review and old activation',async()=>{
  await b.click('.proposal-preview .proposal-buttons button');assert.equal(await text('[data-testid=checked-game]'),'Checked game: Beacon Steps');
  await b.click('#play-tab');await reopen(pocket.path);await ownHandCovered();
  assert.equal(await selected(),'pocket-signals');await b.click('#workshop-tab');
  assert.equal(await staged(),draft);assert.equal(await approvals(),0);assert.match(await preview(),/game changed.*review.*current game/i);
  assert.equal(await text('[data-testid=checked-game]'),'Checked game: Beacon Steps');assert.equal(await count('#use-checked-pack'),0);
  return {draftPreservedByteForByte:true,reviewInvalidated:true,oldCheckStillCorrectlyAttributed:true};
 });
 await check('Explicit re-review rejects the old game; fresh current-game review succeeds',async()=>{
  await b.click('#validate-proposal');assert.equal(await staged(),draft);assert.equal(await approvals(),0);assert.match(await preview(),/game/i);
  const rejection=await preview();await b.click('#load-example');await b.click('#validate-proposal');
  assert.equal(JSON.parse(await staged()).gameId,'pocket-signals');assert.equal(await approvals(),1);
  await b.click('.proposal-preview .proposal-buttons button');assert.equal(await text('[data-testid=checked-game]'),'Checked game: Pocket Signals');
  assert.equal(await count('#use-checked-pack'),1);await b.click('#use-checked-pack');await ownHandCovered();
  return {oldDraftRejection:rejection,freshApprovalGame:'pocket-signals'};
 });
 await check('Reverse cross-game reopen also invalidates only review, not draft',async()=>{
  await b.click('#workshop-tab');draft=await staged();assert.equal(await approvals(),1);
  await b.click('#play-tab');await reopen(beacon.path);assert.equal(await selected(),'beacon-steps');
  await b.click('#workshop-tab');assert.equal(await staged(),draft);assert.equal(await approvals(),0);assert.match(await preview(),/game changed/i);
  await b.click('#validate-proposal');assert.equal(await approvals(),0);assert.match(await preview(),/game/i);
  return {from:'pocket-signals',to:'beacon-steps',draftPreservedByteForByte:true,staleApprovalAbsent:true};
 });
 await check('Unreviewed incomplete author text survives cross-game import unchanged',async()=>{
  const incomplete='  My unfinished proposal\n{"summary": "keep this draft"  ';
  await replaceDraft(incomplete);assert.equal(await approvals(),0);
  await b.click('#play-tab');await reopen(pocket.path);await ownHandCovered();await b.click('#workshop-tab');
  assert.equal(await staged(),incomplete);assert.equal(await approvals(),0);assert.match(await preview(),/game changed/i);
  return {incompleteDraftPreservedByteForByte:true};
 });
 await check('Blank draft stays blank without a misleading review error',async()=>{
  await replaceDraft(' \n  ');await b.click('#play-tab');await reopen(beacon.path);await b.click('#workshop-tab');
  assert.equal(await staged(),' \n  ');assert.equal(await approvals(),0);assert.equal(await preview(),'');
  return {whitespacePreserved:true,noReviewError:true};
 });
 assert.equal(receipt.checks.length,7);receipt.ok=true;
}catch(e){receipt.ok=false;receipt.failure=e.stack;process.exitCode=1;}
finally{
 if(b){
  receipt.browserErrors=[...b.errors];receipt.requests=[...b.requests];
  try{
   assert.deepEqual(receipt.browserErrors,[]);
   const entry=new URL(b.entryURL);entry.hash='';entry.search='';
   receipt.forbiddenRequests=receipt.requests.filter(r=>{const u=new URL(r.url);if(['blob:','data:','about:'].includes(u.protocol))return false;u.hash='';u.search='';return u.href!==entry.href;});
   assert.deepEqual(receipt.forbiddenRequests,[]);assert.deepEqual(await readFile(file),original);receipt.artifactUnchanged=true;
  }catch(e){receipt.ok=false;receipt.evidenceFailure=e.stack;process.exitCode=1;}
  try{await b.close();receipt.browserClosed=true;}catch(e){receipt.ok=false;receipt.cleanupFailure=e.stack;process.exitCode=1;}
 }
 receipt.finishedAt=new Date().toISOString();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
