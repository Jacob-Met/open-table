import assert from 'node:assert/strict';
import {access,copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';

const source=process.env.OPEN_TABLE_RECEIVING_FILE,manifestSource=process.env.OPEN_TABLE_OFFLINE_MANIFEST;
if(!source||!manifestSource)throw new Error('Set OPEN_TABLE_RECEIVING_FILE and OPEN_TABLE_OFFLINE_MANIFEST to the actual HTML and its manifest.');
const output=resolve(process.env.OPEN_TABLE_OFFLINE_DIR||'receiving/offline');
try{await access(output);throw new Error('Use a fresh offline receiving directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const sha=x=>createHash('sha256').update(x).digest('hex');
const bytes=await readFile(resolve(source)),manifestBytes=await readFile(resolve(manifestSource)),manifest=JSON.parse(manifestBytes);
assert.equal(manifest.format,'open-table.offline-build.v1');
assert.equal(manifest.output.bytes,bytes.length);assert.equal(manifest.output.sha256,sha(bytes));
const matches=[...bytes.toString('utf8').matchAll(/<script type="application\/json" id="open-table-offline-build">\n([\s\S]*?)<\/script>/g)];
assert.equal(matches.length,1,'One embedded build manifest');
const embedded=JSON.parse(matches[0][1]),{output:artifactOutput,...externalInformation}=manifest;
assert.deepEqual(embedded,externalInformation);
for(const [name,input] of Object.entries(embedded.inputs)){
 assert.match(name,/^(?:src\/[^/]+\.(?:js|mjs|json)|scripts\/(?:build-offline|write-ruleset-pins)\.mjs|index\.html|styles\.css|package\.json|npm-shrinkwrap\.json)$/);
 const local=await readFile(new URL('../'+name,import.meta.url));
 assert.equal(local.length,input.bytes,'Input bytes '+name);assert.equal(sha(local),input.sha256,'Input SHA '+name);
}
const isolated=join(output,'isolated'),renamed=join(output,'renamed'),downloads=join(output,'downloads');
for(const dir of [isolated,renamed,downloads])await mkdir(dir);
const entry=join(isolated,basename(source)),renamedEntry=join(renamed,'Open Table — café table.html');
await copyFile(resolve(source),entry);await copyFile(resolve(source),renamedEntry);
assert.deepEqual(await readdir(isolated),[basename(entry)]);assert.deepEqual(await readdir(renamed),[basename(renamedEntry)]);
const receipt={schema:'open-table.offline-receiving.v1',startedAt:new Date().toISOString(),artifact:{bytes:bytes.length,sha256:sha(bytes),manifestSha256:sha(manifestBytes)},sourceInputs:embedded.inputs,checks:[],observations:[],screenshots:[],browserRuns:[],browserErrors:[],limitations:['Chrome on Linux only; other browser and operating-system combinations untested.','File input receives a real local file through CDP; native operating-system picker interaction is not claimed.','Shared-screen local play is a trusted-device prototype.']};
let b,runLabel='normal';
const evaluate=s=>b.evaluate(s);
async function until(read,label,ms=10000){const end=Date.now()+ms;while(Date.now()<end){if(await read())return;await delay(50);}throw new Error('Timeout: '+label);}
const visible=s=>evaluate('(()=>{const e=document.querySelector('+JSON.stringify(s)+');return !!e&&!!e.getClientRects().length;})()');
const board=()=>evaluate('document.querySelector(".track")?.getAttribute("aria-label")||null');
const hand=()=>visible('[data-testid=private-hand]');
async function check(name,run){
 const started=Date.now();
 try{const evidence=await run();receipt.checks.push(name);receipt.observations.push({name,passed:true,elapsedMs:Date.now()-started,evidence});console.log(JSON.stringify({check:name,passed:true}));}
 catch(e){receipt.observations.push({name,passed:false,error:e.stack||String(e)});throw e;}
}
async function upload(file){
 const {root}=await b.send('DOM.getDocument');
 const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
 await b.send('DOM.setFileInputFiles',{nodeId,files:[file]});
}
async function closeRun(){
 if(!b)return;
 const requests=[...b.requests],entryURL=b.entryURL;
 const permitted=new URL(entryURL);permitted.hash='';permitted.search='';
 const forbidden=requests.filter(r=>{try{const u=new URL(r.url);if(['data:','blob:','about:'].includes(u.protocol))return false;u.hash='';u.search='';return u.protocol!=='file:'||u.href!==permitted.href;}catch{return true;}});
 receipt.browserRuns.push({label:runLabel,entryURL,networkOfflineBeforeNavigation:true,requests,forbidden});
 receipt.browserErrors.push(...b.errors);
 await b.close();b=null;
 assert.deepEqual(forbidden,[],'Unexpected page dependency');assert.deepEqual(receipt.browserErrors,[]);
}
async function launch(file,label){
 await closeRun();runLabel=label;
 b=await launchBrowser({filePath:file,artifactRoot:dirname(file),offline:true,width:1440,height:1000,screenshotDir:output});
 await b.send('Page.bringToFront');
 await until(()=>visible('#one-key-entry'),'normal file entry');
 receipt.browser=await b.send('Browser.getVersion');
}
try{
 await launch(entry,'isolated original name');
 await check('Standalone file cold-opens with no sibling assets',async()=>{
  assert.equal(await evaluate('location.protocol'),'file:');
  assert.equal(await evaluate('document.querySelector("#table-title").textContent'),'Beacon Steps');
  assert.equal(await evaluate('document.querySelector("[data-game=beacon-steps]").getAttribute("aria-pressed")'),'true');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("[data-game=beacon-steps]")).backgroundColor'),'rgb(29, 71, 62)');
  assert.match(await board(),/marker at 0$/);
  receipt.screenshots.push(await b.screenshot('offline-desktop.png'));
  return {directoryFiles:await readdir(isolated),location:await evaluate('location.href')};
 });
 await check('Ordinary Beacon controls reach exact seven and replay',async()=>{
  for(let i=0;i<3;i++)await b.click('[data-choice="1"]');
  assert.match(await board(),/marker at 6$/);
  assert.equal(await evaluate('document.querySelectorAll("[data-choice]").length'),1);
  await b.click('[data-choice="0"]');assert.match(await board(),/marker at 7$/);assert.equal(await visible('#new-game'),true);
  await b.click('#new-game');assert.match(await board(),/marker at 0$/);
 });
 await check('Ordinary Pocket handoffs complete without leaving a private hand visible',async()=>{
  await b.click('[data-game="pocket-signals"]');
  for(let i=0;i<4;i++){
   assert.equal(await hand(),false);await b.click('#reveal-hand');assert.equal(await hand(),true);
   await b.click('[data-choice="0"]');assert.equal(await hand(),false);
  }
  assert.equal(await visible('#new-game'),true);await b.click('#new-game');assert.equal(await visible('#reveal-hand'),true);
 });
 let packPath;
 await check('Offline Blob download contains only the pinned pack selection',async()=>{
  await b.click('#reveal-hand');
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await b.click('#save-pack');
  await until(async()=>{const names=await readdir(downloads);const name=names.find(n=>n.endsWith('.open-table.json'));if(name)packPath=join(downloads,name);return !!packPath;},'pack download');
  const packBytes=await readFile(packPath),pack=JSON.parse(packBytes);
  assert.deepEqual(Object.keys(pack).sort(),['adapter','classification','gameId','rulesetPin','schema'].sort());
  assert.equal(pack.gameId,'pocket-signals');assert.equal(pack.adapter,'shape-text');
  assert.equal(pack.rulesetPin,embedded.sourceBinding.pins['pocket-signals']);
  return {filename:basename(packPath),bytes:packBytes.length,sha256:sha(packBytes)};
 });
 await check('Real file-input reopen rechecks the pack and covers private cards',async()=>{
  await b.click('[data-pack="switch-select"]');await b.click('#reveal-hand');assert.equal(await hand(),true);
  await upload(packPath);
  await until(()=>evaluate('/checked again/.test(document.querySelector("[data-testid=pack-status]").textContent)'),'pack checked');
  assert.equal(await hand(),false);assert.equal(await visible('#reveal-hand'),true);
  assert.equal(await evaluate('document.querySelector("[data-pack=shape-text]").getAttribute("aria-pressed")'),'true');
 });
 await check('Tampered local pack is rejected with the current selection preserved',async()=>{
  const tampered=JSON.parse(await readFile(packPath,'utf8'));tampered.hands=[[2,4],[1,3]];
  const bad=join(downloads,'tampered-pack.json');await writeFile(bad,JSON.stringify(tampered));
  await upload(bad);await until(()=>evaluate('/Could not open pack/.test(document.querySelector("[data-testid=pack-status]").textContent)'),'tampered pack rejection');
  assert.equal(await evaluate('document.querySelector("[data-pack=shape-text]").getAttribute("aria-pressed")'),'true');
  assert.equal(await hand(),false);
 });
 await check('Offline workshop rejects a leak and activates an independently checked pack',async()=>{
  await b.click('#workshop-tab');await b.click('[data-lab="reveal-opponent"]');
  assert.match(await evaluate('document.querySelector("#lab-result").textContent'),/information leak/);
  assert.equal(await visible('#use-checked-pack'),false);assert.equal(await hand(),false);
  await b.click('[data-lab="switch-select"]');
  assert.match(await evaluate('document.querySelector("#lab-result").textContent'),/450 states · 420 transitions · 30 initial states/);
  await b.click('#use-checked-pack');assert.equal(await visible('#reveal-hand'),true);assert.equal(await hand(),false);
 });
 await check('Reload clears a revealed private hand in ordinary and one-key entry',async()=>{
  await b.click('#reveal-hand');assert.equal(await hand(),true);await b.send('Page.reload');
  await until(()=>visible('#one-key-entry'),'ordinary reload');assert.equal(await hand(),false);assert.match(await board(),/marker at 0$/);
  const original=await evaluate('location.href');await b.click('#one-key-entry');
  assert.equal(await evaluate('location.hash'),'#one-key');
  await b.click('[data-game="pocket-signals"]');await b.click('#reveal-hand');assert.equal(await hand(),true);
  await b.send('Page.reload');await until(()=>visible('#one-key-setup-title'),'one-key reload');assert.equal(await hand(),false);
  assert.equal(await evaluate('location.href.split("#")[0]'),original.split('#')[0]);
  await b.click('#one-key-exit');assert.equal(await evaluate('location.hash'),'');assert.equal(await hand(),false);
 });
 await check('A renamed Unicode and space filename preserves games and one-key entry',async()=>{
  await launch(renamedEntry,'isolated renamed Unicode name');
  assert.deepEqual(await readdir(renamed),[basename(renamedEntry)]);
  await b.click('[data-choice="0"]');assert.match(await board(),/marker at 1$/);
  await b.click('[data-game="pocket-signals"]');await b.click('#reveal-hand');assert.equal(await hand(),true);await b.click('#cover-hand');assert.equal(await hand(),false);
  await b.click('#one-key-entry');assert.equal(await visible('#one-key-setup-title'),true);assert.equal(await evaluate('location.hash'),'#one-key');
  await b.click('#one-key-exit');assert.equal(await hand(),false);
  return {filename:basename(renamedEntry),location:await evaluate('location.href')};
 });
 await check('Offline narrow layout retains controls without horizontal overflow',async()=>{
  await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
  await b.click('[data-game="beacon-steps"]');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const sizes=await evaluate('[...document.querySelectorAll("[data-choice]")].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');
  assert.ok(sizes.every(x=>x.width>=44&&x.height>=44));
  await evaluate('document.querySelector(".table-panel").scrollIntoView({block:"start"});true');
  receipt.screenshots.push(await b.screenshot('offline-320.png'));
 });
 await closeRun();
 await check('All observed page requests remain within each isolated HTML file',async()=>{
  assert.ok(receipt.browserRuns.length>=2);
  for(const run of receipt.browserRuns){assert.ok(run.requests.length>0,'Entry request must be recorded');assert.deepEqual(run.forbidden,[]);}
  assert.deepEqual(receipt.browserErrors,[]);
  return receipt.browserRuns.map(x=>({label:x.label,requests:x.requests.length,forbidden:x.forbidden.length}));
 });
 assert.equal(receipt.checks.length,11);receipt.ok=true;
}catch(error){receipt.ok=false;receipt.failure=error.stack||String(error);process.exitCode=1;if(b)await b.screenshot('offline-failure.png').catch(()=>{});}
finally{
 try{await closeRun();}catch(e){receipt.ok=false;receipt.cleanupFailure=e.stack||String(e);process.exitCode=1;}
 receipt.finishedAt=new Date().toISOString();
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
