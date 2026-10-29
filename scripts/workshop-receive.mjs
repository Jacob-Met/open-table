import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {launchBrowser} from './browser-driver.mjs';

// Observe ordinary player DOM only. Never mount fixtures or read private game state.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 assert.ok(['--file','--url','--output'].includes(args[i])&&args[i+1]&&!options[args[i]],'Expected unique --file/--url/--output value');
 options[args[i]]=args[i+1];
}
assert.ok(!(options['--file']&&options['--url']),'Supply at most one of --file or --url');
assert.notEqual(process.getuid?.(),0,'Run as a non-root user: maintained browser sandbox is required');
const file=options['--file']?resolve(options['--file']):null;
let url=options['--url'];
if(url){const u=new URL(url);assert.equal(u.protocol,'http:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.username+u.password+u.hash,'');}
const output=resolve(options['--output']||process.env.OPEN_TABLE_WORKSHOP_DIR||'receiving/workshop');
await mkdir(dirname(output),{recursive:true});
await mkdir(output);
const sha=x=>createHash('sha256').update(x).digest('hex');
const original=file?await readFile(file):null;
const receipt={schema:'open-table.workshop-receiving.v1',startedAt:new Date().toISOString(),entry:file||url,networkOfflineBeforeNavigation:Boolean(file),artifact:original?{bytes:original.length,sha256:sha(original)}:null,checks:[],observations:[],screenshots:[],limitations:['Chrome on Linux; no physical-device or universal accessibility claim.','Trusted-device pass-and-play only; this checks rendered player DOM and explicit handoffs, not secure multiplayer isolation.','Random ordinary Pocket deal, with only deliberately revealed own cards observed; no hidden-state introspection.']};
let b,server;
const evaluate=s=>b.evaluate(s);
const text=s=>evaluate('document.querySelector('+JSON.stringify(s)+')?.textContent||null');
const count=s=>evaluate('document.querySelectorAll('+JSON.stringify(s)+').length');
async function check(name,run){try{const evidence=await run();receipt.checks.push(name);receipt.observations.push({name,passed:true,evidence});console.log(JSON.stringify({check:name,passed:true}));}catch(e){receipt.observations.push({name,passed:false,error:String(e)});throw e;}}
const publicSnapshot=()=>evaluate(`({title:document.querySelector('#table-title')?.textContent,game:document.querySelector('[data-game][aria-pressed="true"]')?.dataset.game,pack:document.querySelector('[data-pack][aria-pressed="true"]')?.dataset.pack,board:document.querySelector('[data-testid="board"]')?.textContent,track:document.querySelector('.track')?.getAttribute('aria-label'),choices:[...document.querySelectorAll('[data-choice]')].map(e=>({id:e.dataset.choice,text:e.textContent}))})`);
const ownHand=()=>evaluate(`({label:document.querySelector('#private-title')?.textContent,cards:[...document.querySelectorAll('[data-testid="private-hand"] .playing-card')].map(e=>e.getAttribute('aria-label')),choices:[...document.querySelectorAll('[data-choice]')].map(e=>({id:e.dataset.choice,text:e.textContent}))})`);
async function covered(){
 assert.equal(await count('[data-testid="private-hand"],#private-title,[data-testid="choice-comparison"],[data-choice],.playing-card'),0,'Private hand and actionable card choices must be absent from DOM, not merely hidden');
 assert.doesNotMatch(await text('[data-testid="public-live"]')||'',/Commit card|Own hand:|Leaked opponent|Card \d/i,'Shared announcement must not expose card values');
}
async function label(game){assert.equal(await text('[data-testid="checked-game"]'),'Checked game: '+game);}
async function negative(){
 await b.click('[data-lab="reveal-opponent"]');await label('Pocket Signals');
 assert.match(await text('#lab-result'),/information leak/i);
 assert.match(await text('#lab-result'),/synthetic states, separate from your game/i);
 assert.equal(await count('#lab-result .witness'),2);
 assert.equal(await count('#use-checked-pack'),0);
 await covered();
}
async function keyActivate(selector,key='Enter'){await evaluate('document.querySelector('+JSON.stringify(selector)+').focus();true');await b.key(key);}
try{
 if(!file&&!url){const {createAppServer}=await import('../server.mjs');server=createAppServer();await new Promise((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});url='http://127.0.0.1:'+server.address().port+'/';receipt.entry=url;}
 b=await launchBrowser(file?{filePath:file,artifactRoot:dirname(file),offline:true,width:1280,height:980,screenshotDir:output}:{url,width:1280,height:980,screenshotDir:output});
 await b.send('Page.bringToFront');
 for(let n=0;n<100&&!(await count('#table-title'));n++)await delay(50);
 receipt.browser=await b.send('Browser.getVersion');receipt.browserPID=b.pid;receipt.sandboxRequired=true;
 let beacon,draft,preview;
 await check('Progressed Beacon survives a positive Workshop check and pack activation',async()=>{
  assert.equal(await text('#table-title'),'Beacon Steps');
  await b.click('[data-choice="1"]');await keyActivate('[data-choice="0"]');
  beacon=await publicSnapshot();assert.equal(beacon.track,'Shared path, marker at 3');
  await b.click('#workshop-tab');await b.click('[data-lab="shape-text"]');await label('Beacon Steps');
  assert.match(await text('#lab-result'),/game is preserved/i);
  await b.click('#use-checked-pack');assert.deepEqual(await publicSnapshot(),beacon);
  return beacon;
 });
 await check('Pocket synthetic leakage check preserves progressed Beacon and its reviewed proposal',async()=>{
  await b.click('#workshop-tab');await b.click('#load-example');await b.click('#validate-proposal');
  draft=await evaluate('document.querySelector("#proposal-json").value');preview=await text('.proposal-preview');
  assert.equal(JSON.parse(draft).gameId,'beacon-steps');assert.match(preview,/awaiting author review/i);
  await negative();assert.equal(await evaluate('document.querySelector("#proposal-json").value'),draft);assert.equal(await text('.proposal-preview'),preview);
  assert.equal(await evaluate('document.querySelector("[data-game][aria-pressed=true]").dataset.game'),'beacon-steps');
  receipt.screenshots.push(await b.screenshot('beacon-pocket-synthetic-check.png'));
  await keyActivate('#play-tab');assert.deepEqual(await publicSnapshot(),beacon);
  await b.click('#workshop-tab');await b.click('[data-lab="shape-text"]');await label('Beacon Steps');
  assert.equal(await evaluate('document.querySelector("#proposal-json").value'),draft);
  await b.click('#play-tab');assert.deepEqual(await publicSnapshot(),beacon);
  await b.click('[data-choice="1"]');await keyActivate('[data-choice="1"]','Space');
  assert.equal((await publicSnapshot()).track,'Shared path, marker at 7');assert.equal(await count('[data-choice]'),0);
  assert.match(await text('.end-result'),/Player 2 takes it/);
  receipt.screenshots.push(await b.screenshot('beacon-preserved-finish.png'));
  return {preservedPosition:3,finishedPosition:7,proposalRetained:true};
 });
 let firstCard,secondCard,p2Hand;
 await check('Pocket own hand survives Workshop while return requires deliberate reveal',async()=>{
  await b.click('[data-game="pocket-signals"]');await covered();
  await keyActivate('#reveal-hand');const hand=await ownHand();assert.equal(hand.cards.length,2);
  await b.click('#workshop-tab');await covered();await negative();await b.click('#play-tab');await covered();
  assert.equal(await count('#reveal-hand'),1);await keyActivate('#reveal-hand');assert.deepEqual(await ownHand(),hand);
  firstCard=Number(hand.choices[0].text.match(/\d+/)[0]);
  await b.click('[data-choice="0"]');await covered();assert.match(await text('[data-testid="handoff"]'),/Player 2/);
  return {handPreserved:true,deliberateRevealRequired:true,committedChoice:firstCard};
 });
 await check('Pending Pocket commitment and Player 2 handoff survive negative and positive checks',async()=>{
  const pending=await publicSnapshot();
  await b.click('#workshop-tab');await negative();await b.click('#play-tab');await covered();assert.deepEqual(await publicSnapshot(),pending);
  await keyActivate('#reveal-hand');p2Hand=await ownHand();assert.equal(p2Hand.cards.length,2);
  await b.click('#workshop-tab');await covered();await b.click('[data-lab="shape-text"]');await label('Pocket Signals');
  assert.match(await text('#lab-result'),/game is preserved/i);await b.click('#use-checked-pack');await covered();assert.deepEqual(await publicSnapshot(),pending);
  await b.click('#reveal-hand');assert.deepEqual(await ownHand(),p2Hand);
  secondCard=Number(p2Hand.choices[0].text.match(/\d+/)[0]);
  await keyActivate('[data-choice="0"]');await covered();
  assert.equal(await text('.round-chip'),'Round 1: P1 played '+firstCard+' · P2 played '+secondCard);
  assert.match(await text('.scoreline'),firstCard>secondCard?/P1 1 points · P2 0 points/:/P1 0 points · P2 1 points/);
  receipt.screenshots.push(await b.screenshot('pocket-preserved-round-and-handoff.png'));
  const round=await publicSnapshot();
  await b.click('#workshop-tab');await negative();await b.click('#play-tab');await covered();assert.deepEqual(await publicSnapshot(),round);
  for(let i=0;i<2;i++){await b.click('#reveal-hand');assert.equal((await ownHand()).cards.length,1);await b.click('[data-choice="0"]');await covered();}
  assert.equal(await count('.round-chip'),2);assert.equal(await count('#new-game'),1);
  return {pendingTurnPreserved:true,firstRoundRevealedCards:[firstCard,secondCard],completedRounds:2};
 });
 await check('A retained check for another game cannot activate after a real cross-game pack import',async()=>{
  await b.click('#new-game');
  const downloads=join(output,'downloads');await mkdir(downloads);
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await b.click('#save-pack');
  let packPath;
  for(let n=0;n<200;n++){
   const names=await readdir(downloads),name=names.find(x=>x.endsWith('.open-table.json'));
   if(name){packPath=join(downloads,name);break;}await delay(50);
  }
  assert.ok(packPath,'Actual application pack download must complete');
  const packBytes=await readFile(packPath),pack=JSON.parse(packBytes);
  assert.equal(pack.gameId,'pocket-signals');assert.equal(pack.adapter,'shape-text');
  assert.deepEqual(Object.keys(pack).sort(),['adapter','classification','gameId','rulesetPin','schema'].sort());
  await b.click('[data-game="beacon-steps"]');await b.click('#workshop-tab');
  await b.click('[data-lab="shape-text"]');await label('Beacon Steps');assert.equal(await count('#use-checked-pack'),1);
  await b.click('#play-tab');
  const {root}=await b.send('DOM.getDocument');
  const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
  assert.ok(nodeId);await b.send('DOM.setFileInputFiles',{nodeId,files:[packPath]});
  for(let n=0;n<200&&!/checked again/.test(await text('[data-testid="pack-status"]')||'');n++)await delay(50);
  assert.match(await text('[data-testid="pack-status"]'),/checked again/);
  assert.equal(await text('#table-title'),'Pocket Signals');await covered();
  await b.click('#workshop-tab');await label('Beacon Steps');
  assert.equal(await count('#use-checked-pack'),0);
  assert.match(await text('#lab-result'),/Check an adaptation for Pocket Signals before using it at the table/);
  receipt.screenshots.push(await b.screenshot('cross-game-result-activation-blocked.png'));
  await b.click('[data-lab="shape-text"]');await label('Pocket Signals');assert.equal(await count('#use-checked-pack'),1);
  await b.click('#use-checked-pack');assert.equal(await text('#table-title'),'Pocket Signals');await covered();
  return {download:packPath,bytes:packBytes.length,sha256:sha(packBytes),priorCheckedGame:'Beacon Steps',currentGame:'Pocket Signals',freshCheckRequired:true};
 });
 assert.equal(receipt.checks.length,5);receipt.ok=true;
}catch(e){receipt.ok=false;receipt.failure=e.stack||String(e);process.exitCode=1;if(b)try{receipt.screenshots.push(await b.screenshot('workshop-failure.png'));}catch{}}
finally{
 if(b){
  receipt.browserErrors=[...b.errors];receipt.requests=[...b.requests];
  try{
   const entry=new URL(b.entryURL||url);entry.hash='';entry.search='';
   receipt.forbiddenRequests=receipt.requests.filter(r=>{const u=new URL(r.url);if(['blob:','data:','about:'].includes(u.protocol))return false;if(file){u.hash='';u.search='';return u.href!==entry.href;}return u.origin!==entry.origin;});
   assert.deepEqual(receipt.forbiddenRequests,[]);assert.deepEqual(receipt.browserErrors,[]);
   if(file){const after=await readFile(file);assert.deepEqual(after,original);receipt.artifactUnchanged=true;}
  }catch(e){receipt.ok=false;receipt.evidenceFailure=e.stack||String(e);process.exitCode=1;}
  try{await b.close();receipt.browserClosed=true;}catch(e){receipt.ok=false;receipt.cleanupFailure=String(e);process.exitCode=1;}
 }
 if(server){try{await new Promise((accept,reject)=>server.close(e=>e?reject(e):accept()));receipt.ownedServerClosed=true;}catch(e){receipt.ok=false;receipt.serverCleanupFailure=String(e);process.exitCode=1;}}
 receipt.finishedAt=new Date().toISOString();await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
