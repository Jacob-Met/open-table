import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';
import {getCatalog} from '../src/catalog.js';
import {AUTHORING_INSTRUCTIONS} from '../src/author-request.js';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 assert.ok(['--file','--url','--output'].includes(args[i])&&args[i+1]&&!options[args[i]],'Expected unique --file/--url/--output value');
 options[args[i]]=args[i+1];
}
assert.ok(!(options['--file']&&options['--url']),'Supply at most one entry');
assert.notEqual(process.getuid?.(),0,'Maintained browser sandbox requires a non-root user');
const file=options['--file']?resolve(options['--file']):null;
let url=options['--url'];
if(url){const u=new URL(url);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username+u.password+u.hash,'');}
const output=resolve(options['--output']||'receiving/author-request');
await mkdir(dirname(output),{recursive:true});await mkdir(output);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const inputs=['src/author-request.js','src/app.js','src/catalog.js','src/catalog-data.js','src/ruleset-pins.js','server.mjs','styles.css'];
const originalInputs=Object.fromEntries(await Promise.all(inputs.map(async p=>[p,await readFile(join(sourceRoot,p))])));
const original=file?await readFile(file):null;
const receipt={schema:'open-table.author-request-receiving.v1',startedAt:new Date().toISOString(),entry:file||url,offline:Boolean(file),providerRequests:0,reservedCasesExecuted:false,checks:[],observations:[],screenshots:[],hashes:Object.fromEntries(Object.entries(originalInputs).map(([p,b])=>[p,sha(b)])),artifact:original?{bytes:original.length,sha256:sha(original)}:null,limitations:['Chrome/Linux automated controls and pixel inspection; no human access study, physical switch or other-browser claim.','Authored request preparation only; no provider call, model origin authentication, inferred approval or model advantage.','The 2x CSS zoom course is an explicit reflow stress, not a claim of human usability.']};
let b,server;
const evaluate=s=>b.evaluate(s);
const text=s=>evaluate('document.querySelector('+JSON.stringify(s)+')?.textContent||null');
const value=s=>evaluate('document.querySelector('+JSON.stringify(s)+')?.value??null');
const count=s=>evaluate('document.querySelectorAll('+JSON.stringify(s)+').length');
async function settle(){await evaluate('(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()');}
async function waitFor(selector){for(let n=0;n<200;n++){if(await count(selector))return;await delay(25);}throw Error('Missing '+selector);}
async function check(name,run){try{const evidence=await run();receipt.checks.push(name);receipt.observations.push({name,passed:true,evidence});console.log(JSON.stringify({check:name,passed:true}));}catch(error){receipt.observations.push({name,passed:false,error:String(error)});throw error;}}
async function typeGoal(goal){await b.click('#access-goal');await b.key('Control+a');await b.send('Input.insertText',{text:goal});await settle();assert.equal(await value('#access-goal'),goal);}
async function prepareByKeyboard(){await evaluate('document.querySelector("#access-goal").focus();true');await b.key('Tab');assert.equal(await evaluate('document.activeElement.id'),'prepare-author-request');await b.key('Enter');await settle();}
function validate(raw,game,goal){
 const r=JSON.parse(raw),c=getCatalog(game);
 assert.deepEqual(Object.keys(r),['schema','gameId','rulesetPin','accessGoal','messages']);
 assert.equal(r.schema,'open-table.authoring-request.v1');assert.equal(r.gameId,game);assert.equal(r.rulesetPin,c.rulesetPin);assert.equal(r.accessGoal,goal);
 assert.deepEqual(r.messages.map(m=>Object.keys(m)),[['role','content'],['role','content']]);
 assert.equal(r.messages[0].role,'system');assert.equal(r.messages[0].content,AUTHORING_INSTRUCTIONS);assert.equal(r.messages[1].role,'user');
 assert.equal(r.messages[1].content,JSON.stringify({accessGoal:goal,approvedCatalog:{gameId:c.gameId,title:c.title,rulesetPin:c.rulesetPin,rules:c.rules,components:c.components,adapters:c.adapters,sourceRefs:c.sourceRefs,fixtures:c.fixtures}}));
 return r;
}
async function covered(){assert.equal(await count('[data-testid="private-hand"],#private-title,[data-testid="choice-comparison"],[data-choice],.playing-card'),0);}
async function publicSnapshot(){return evaluate('({title:document.querySelector("#table-title")?.textContent,board:document.querySelector("[data-testid=board]")?.textContent,pack:document.querySelector("[data-pack][aria-pressed=true]")?.dataset.pack})');}
try{
 if(!file&&!url){const {createAppServer}=await import('../server.mjs');server=createAppServer();await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});url='http://127.0.0.1:'+server.address().port+'/';receipt.entry=url;}
 b=await launchBrowser(file?{filePath:file,artifactRoot:dirname(file),offline:true,width:1280,height:980,screenshotDir:output}:{url,width:1280,height:980,screenshotDir:output});
 await b.send('Page.bringToFront');await waitFor('#table-title');
 receipt.browser=await b.send('Browser.getVersion');receipt.browserPID=b.pid;receipt.sandboxRequired=true;
 if(file){
  const manifest=JSON.parse(await text('#open-table-offline-build'));
  for(const p of ['src/author-request.js','src/app.js','src/catalog.js','src/catalog-data.js','src/ruleset-pins.js','styles.css'])assert.equal(manifest.inputs[p].sha256,receipt.hashes[p],p);
  receipt.sourceAgreement='Downloaded HTML embedded manifest matches receiving source';
 }else{
  for(const p of ['src/author-request.js','src/app.js','src/catalog.js','src/catalog-data.js','src/ruleset-pins.js','styles.css']){
   const response=await fetch(new URL(p,url));assert.equal(response.status,200,p);assert.equal(sha(new Uint8Array(await response.arrayBuffer())),receipt.hashes[p],p);
  }
  receipt.sourceAgreement='Real served bytes match receiving source';
 }
 const goalA='  I use one switch.\nLet me confirm when ready — ◇ 🎲  ';
 let rawA,rawAEdited,goalB;
 await check('Native keyboard prepares an exact bounded author request',async()=>{
  await b.click('[data-choice="1"]');
  assert.equal(await evaluate('document.querySelector(".track").getAttribute("aria-label")'),'Shared path, marker at 2');
  await b.click('#workshop-tab');
  assert.equal(await value('#access-goal'),'');assert.equal(await count('#download-author-request'),0);
  await prepareByKeyboard();assert.match(await text('.author-request-preview'),/1 to 2,000/);assert.equal(await count('#author-request-json'),0);
  await typeGoal(' \n\t ');await prepareByKeyboard();assert.match(await text('.author-request-preview'),/1 to 2,000/);
  await typeGoal(goalA);await prepareByKeyboard();
  rawA=await value('#author-request-json');validate(rawA,'beacon-steps',goalA);
  assert.equal(await evaluate('document.querySelector("#author-request-json").readOnly'),true);
  assert.match(await text('.author-request-preview'),/Prepared locally for Beacon Steps/);
  assert.match(await text('.request-state'),/Nothing has been sent to a model/);
  assert.match(await text('#author-request-notice'),/exactly as written/);
  assert.equal(await evaluate('document.querySelector("#access-goal").maxLength'),2000);
  await evaluate('document.querySelector(".authoring-column").scrollIntoView({block:"start"});true');await settle();
  receipt.screenshots.push(await b.screenshot('author-request-desktop.png'));
  await b.click('#play-tab');assert.equal(await evaluate('document.querySelector(".track").getAttribute("aria-label")'),'Shared path, marker at 2');
  await b.click('#workshop-tab');assert.equal(await value('#author-request-json'),rawA);
  return {game:'beacon-steps',verbatimGoal:true,blankRefused:true,keyboardActivation:true,progressPreserved:true};
 });
 await check('The browser downloads the exact inspected request bytes',async()=>{
  const downloads=join(output,'downloads');await mkdir(downloads);
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await b.click('#download-author-request');
  let downloaded;
  for(let n=0;n<200;n++){const names=await readdir(downloads);const name=names.find(x=>x.endsWith('.open-table-request.json'));if(name){downloaded=join(downloads,name);break;}await delay(25);}
  assert.ok(downloaded,'Actual prepared request download must complete');
  const bytes=await readFile(downloaded);assert.deepEqual(bytes,Buffer.from(rawA));
  const request=validate(bytes.toString(),'beacon-steps',goalA);
  assert.ok(downloaded.endsWith('beacon-steps-'+request.rulesetPin.slice(7,19)+'.open-table-request.json'));
  receipt.download={file:downloaded,bytes:bytes.length,sha256:sha(bytes)};
  return {...receipt.download,displayedBytesEqual:true};
 });
 await check('Editing and game selection keep prepared drafts correctly separated',async()=>{
  const edited=goalA+' More time.';
  await typeGoal(edited);assert.equal(await count('#author-request-json,#download-author-request'),0);
  await prepareByKeyboard();rawAEdited=await value('#author-request-json');validate(rawAEdited,'beacon-steps',edited);
  await b.click('[data-game="pocket-signals"]');
  assert.equal(await value('#access-goal'),'');assert.equal(await count('#author-request-json,#download-author-request'),0);
  goalB='Read only my own card labels.\nKeep the other player’s card covered.';
  await typeGoal(goalB);await prepareByKeyboard();const rawB=await value('#author-request-json');validate(rawB,'pocket-signals',goalB);
  await b.click('[data-game="beacon-steps"]');
  assert.equal(await value('#access-goal'),edited);assert.equal(await value('#author-request-json'),rawAEdited);
  assert.match(await text('.author-request-preview'),/Prepared locally for Beacon Steps/);
  await b.click('[data-game="pocket-signals"]');assert.equal(await value('#access-goal'),goalB);assert.equal(await value('#author-request-json'),rawB);
  await typeGoal('  ');await prepareByKeyboard();assert.equal(await count('#author-request-json,#download-author-request'),0);assert.match(await text('.author-request-preview'),/1 to 2,000/);
  await b.send('Page.reload',{ignoreCache:true});await waitFor('#table-title');await b.click('#workshop-tab');
  assert.equal(await value('#access-goal'),'');assert.equal(await count('#author-request-json,#download-author-request'),0);
  return {editedRequestInvalidated:true,perGameDrafts:true,failedPrepareClearsDownload:true,reloadClearsDrafts:true};
 });
 await check('Private match and saved snapshot stay outside the explicit request',async()=>{
  await b.click('[data-game="pocket-signals"]');await b.click('#play-tab');await covered();
  await b.click('#reveal-hand');await b.click('[data-choice="0"]');await covered();
  await b.click('#save-match');await b.click('#match-confirm');await covered();
  const savedBefore=await evaluate('JSON.stringify(Object.entries(localStorage).sort())');assert.notEqual(savedBefore,'[]','Explicit save must exist in this receiving profile');
  const pending=await publicSnapshot();
  await b.click('#reveal-hand');
  const hand=await evaluate('[...document.querySelectorAll("[data-testid=private-hand] .playing-card")].map(x=>x.getAttribute("aria-label"))');assert.equal(hand.length,2);
  await b.click('#workshop-tab');await covered();
  const goal='<img src=x onerror="globalThis.authorRequestInjected=true"> & "quoted"\nMy explicit author marker: PRIVATE-GOAL-XYZ';
  await typeGoal(goal);await prepareByKeyboard();const raw=await value('#author-request-json');validate(raw,'pocket-signals',goal);
  assert.equal(await evaluate('globalThis.authorRequestInjected===true'),false);
  assert.equal(await count('.author-request-panel img,.author-request-panel script'),0);
  assert.equal(await value('#access-goal'),goal);
  assert.match(await text('#author-request-notice'),/Leave out private information/);
  const savedAfter=await evaluate('JSON.stringify(Object.entries(localStorage).sort())');assert.equal(savedAfter,savedBefore);
  await b.click('#play-tab');await covered();assert.deepEqual(await publicSnapshot(),pending);
  await b.click('#reveal-hand');assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-testid=private-hand] .playing-card")].map(x=>x.getAttribute("aria-label"))'),hand);
  await b.click('#workshop-tab');await covered();assert.equal(await value('#author-request-json'),raw);
  return {currentPlayerHandPreserved:true,pendingTurnPreserved:true,savedStorageSha256:sha(savedBefore),storageUnchanged:true,staticCatalogOnly:true,explicitGoalUnmodified:true,htmlNotExecuted:true};
 });
 await check('Request controls reflow and retain visible keyboard focus',async()=>{
  const observations=[];
  for(const config of [{name:'320px',width:320,height:844,zoom:1},{name:'2x-css-zoom',width:1280,height:980,zoom:2}]){
   await b.send('Emulation.setDeviceMetricsOverride',{width:config.width,height:config.height,deviceScaleFactor:1,mobile:false});
   await evaluate('document.body.style.zoom='+JSON.stringify(String(config.zoom))+';true');await settle();
   const geometry=await evaluate(`(()=>{const nodes=[...document.querySelectorAll('.author-request-panel input,.author-request-panel textarea,.author-request-panel button')];return {innerWidth,documentWidth:document.documentElement.scrollWidth,controls:nodes.map(e=>{const r=e.getBoundingClientRect();return {id:e.id,x:r.x,right:r.right,width:r.width,height:r.height};})};})()`);
   assert.ok(geometry.documentWidth<=geometry.innerWidth+1,'Page horizontal overflow '+JSON.stringify(geometry));
   for(const control of geometry.controls){assert.ok(control.x>=-1&&control.right<=geometry.innerWidth+1,config.name+' '+control.id);assert.ok(control.width>0&&control.height>=44*config.zoom,config.name+' target '+control.id);}
   await evaluate('document.querySelector("#access-goal").focus();true');await b.key('Tab');assert.equal(await evaluate('document.activeElement.id'),'prepare-author-request');
   await b.key('Tab');assert.equal(await evaluate('document.activeElement.id'),'author-request-json');await b.key('Tab');assert.equal(await evaluate('document.activeElement.id'),'download-author-request');
   const focus=await evaluate('(()=>{const e=document.activeElement,s=getComputedStyle(e),r=e.getBoundingClientRect();return {id:e.id,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,top:r.top,bottom:r.bottom,viewport:innerHeight};})()');
   assert.notEqual(focus.outlineStyle,'none');assert.ok(parseFloat(focus.outlineWidth)>0);assert.ok(focus.top>=-1&&focus.bottom<=focus.viewport+1);
   observations.push({config,geometry,focus});
   receipt.screenshots.push(await b.screenshot('author-request-'+config.name+'-download.png'));
   await evaluate('document.querySelector(".author-request-panel").scrollIntoView({block:"start"});true');await settle();
   receipt.screenshots.push(await b.screenshot('author-request-'+config.name+'-start.png'));
  }
  await evaluate('document.body.style.zoom="1";true');
  return observations;
 });
 assert.equal(receipt.checks.length,5);receipt.ok=true;
}catch(error){receipt.ok=false;receipt.failure=error.stack||String(error);process.exitCode=1;if(b)try{receipt.screenshots.push(await b.screenshot('author-request-failure.png'));}catch{}}
finally{
 if(b){
  receipt.browserErrors=[...b.errors];receipt.requests=[...b.requests];
  try{
   const entry=new URL(b.entryURL||url);entry.hash='';entry.search='';
   receipt.forbiddenRequests=receipt.requests.filter(r=>{const u=new URL(r.url);if(['blob:','data:','about:'].includes(u.protocol))return false;if(file){u.hash='';u.search='';return u.href!==entry.href;}return u.origin!==entry.origin;});
   assert.deepEqual(receipt.forbiddenRequests,[]);assert.deepEqual(receipt.browserErrors,[]);
   for(const [p,bytes] of Object.entries(originalInputs))assert.deepEqual(await readFile(join(sourceRoot,p)),bytes,p+' changed');
   receipt.sourceUnchanged=true;
   if(file){assert.deepEqual(await readFile(file),original);receipt.artifactUnchanged=true;}
  }catch(error){receipt.ok=false;receipt.evidenceFailure=error.stack||String(error);process.exitCode=1;}
  try{await b.close();receipt.browserClosed=true;}catch(error){receipt.ok=false;receipt.cleanupFailure=String(error);process.exitCode=1;}
 }
 if(server){try{await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));receipt.ownedServerClosed=true;}catch(error){receipt.ok=false;receipt.serverCleanupFailure=String(error);process.exitCode=1;}}
 receipt.finishedAt=new Date().toISOString();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
