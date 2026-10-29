import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAppServer} from '../server.mjs';
import {RULESET_SOURCE_DIGESTS} from '../src/ruleset-pins.js';
import {launchBrowser} from './browser-driver.mjs';

const output=resolve(process.env.OPEN_TABLE_ONE_KEY_DIR||'receiving/one-key');
try{await access(output+'/receipt.json');throw new Error('Use a fresh one-key receiving directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const externalURL=process.env.OPEN_TABLE_RECEIVING_URL,server=externalURL?null:createAppServer();
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=new URL(externalURL||'http://127.0.0.1:'+server.address().port+'/');
const receipt={schema:'open-table.one-key-receiving.v1',startedAt:new Date().toISOString(),checks:[],observations:[],events:[],hashes:{},browserErrors:[]};
const sha=x=>createHash('sha256').update(x).digest('hex');
let b,bootNumber=0;
const evaluate=s=>b.evaluate(s);
async function until(read,label,timeout=65000){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(await read())return;await delay(60);}
 throw new Error('Timeout: '+label);
}
const visible=s=>evaluate('(()=>{const e=document.querySelector('+JSON.stringify(s)+');return !!e&&!!e.getClientRects().length&&!e.hidden;})()');
const focused=s=>evaluate('!!document.activeElement?.matches('+JSON.stringify(s)+')');
const focusedLabel=()=>evaluate("document.activeElement?.textContent?.trim()||''");
async function state(){
 return evaluate('({phase:document.querySelector("[data-one-key-state]")?.getAttribute("data-one-key-state"),hand:!!document.querySelector("[data-testid=private-hand]")?.getClientRects().length,handoff:!!document.querySelector("[data-testid=handoff]")?.getClientRects().length,terminal:!!document.querySelector(".end-result")?.getClientRects().length,track:document.querySelector(".track")?.getAttribute("aria-label")||null,hash:location.hash,focus:document.activeElement?.id||"",game:document.querySelector("#table-title")?.textContent||null})');
}
async function boot(oneKey=true){
 const address=new URL(base);address.hash=oneKey?'one-key':'';address.searchParams.set('receiving',String(++bootNumber));
 await b.send('Page.navigate',{url:address.href});
 await until(()=>visible(oneKey?'#one-key-setup-title':'#one-key-entry'),'document entry');
 await b.send('Page.bringToFront');await until(()=>evaluate('document.hasFocus()'),'foreground receiving page',5000);
 if(oneKey)await until(()=>focused('[data-game]'),'initial game focus');
}
async function choose(selector,key='Space'){
 await until(()=>focused(selector),'scan focus '+selector);
 const before=await state();await b.key(key);
 receipt.events.push({selector:selector==='button[data-choice]'?'visible legal action':selector,key,before,at:new Date().toISOString()});
 await delay(100);
}
async function raw(key,type,repeat=false){
 const space=key==='Space';
 await b.send('Input.dispatchKeyEvent',{type,key:space?' ':'Enter',code:key,windowsVirtualKeyCode:space?32:13,...(type==='keyDown'?{text:space?' ':'\r',unmodifiedText:space?' ':'\r',autoRepeat:repeat}:{})});
}
async function game(id,key='Space'){
 await choose('[data-game="'+id+'"]',key);await until(()=>visible('[data-one-key-state="play"]'),'play');
 assert.equal((await state()).game,id==='beacon-steps'?'Beacon Steps':'Pocket Signals');
}
async function check(name,run){
 const started=Date.now();
 try{const evidence=await run();receipt.checks.push(name);receipt.observations.push({name,passed:true,elapsedMs:Date.now()-started,evidence});console.log(JSON.stringify({check:name,passed:true,elapsedMs:Date.now()-started}));}
 catch(e){receipt.observations.push({name,passed:false,elapsedMs:Date.now()-started,error:e.stack||String(e)});throw e;}
}
async function complete(id,key){
 await boot();await game(id,key);let turns=0;
 while(!await visible('#new-game')){
  assert.ok(++turns<=(id==='beacon-steps'?7:4),'Exceeded finite game turn bound');
  if(await visible('#reveal-hand'))await choose('#reveal-hand',key);
  await until(()=>visible('button[data-choice]'),'legal choice');
  await choose('button[data-choice]',key);
  if(id==='pocket-signals'&&!await visible('#new-game'))assert.equal((await state()).hand,false,'Commit must cover private hand');
 }
 assert.equal(await visible('.end-result'),true);
 if(id==='beacon-steps')assert.match((await state()).track,/marker at 7$/);
 else assert.equal(turns,4);
 await choose('#new-game',key);assert.equal(await visible('.end-result'),false,'Replay must reset game');
 await choose('#one-key-menu',key);assert.equal(await visible('#one-key-setup-title'),true);assert.equal((await state()).hand,false);
 return {game:id,key,turns,completed:true,replayed:true,returnedToMenu:true};
}
try{
 for(const [name,path] of [['app','src/app.js'],['controller','src/one-key.js']]){
  const local=await readFile(new URL('../'+path,import.meta.url));
  const response=await fetch(new URL(path,base));assert.equal(response.ok,true,'Served '+path);
  const bytes=Buffer.from(await response.arrayBuffer());
  receipt.hashes[name]={source:sha(local),served:sha(bytes),pin:RULESET_SOURCE_DIGESTS[path]};
  assert.equal(receipt.hashes[name].source,receipt.hashes[name].served);assert.equal(receipt.hashes[name].source,receipt.hashes[name].pin);
 }
 b=await launchBrowser({url:new URL('#one-key',base).href,width:1440,height:1000,screenshotDir:output});
 receipt.browser=await b.send('Browser.getVersion');
 for(const key of ['Space','Enter'])for(const id of ['beacon-steps','pocket-signals'])await check('complete '+id+' '+key,()=>complete(id,key));
 await check('ordinary entry holds Enter through setup',async()=>{
  await boot(false);let tabs=0;
  while(!await focused('#one-key-entry')){assert.ok(++tabs<=30,'Entry is not keyboard reachable');await b.key('Tab');}
  await raw('Enter','keyDown');await delay(100);
  assert.equal(await visible('#one-key-setup-title'),true);
  for(let i=0;i<5;i++){await delay(350);await raw('Enter','keyDown',true);assert.equal(await visible('#one-key-setup-title'),true);assert.equal(await visible('[data-testid=board]'),false);}
  await raw('Enter','keyUp');await until(()=>focused('[data-game="beacon-steps"]'),'fresh setup focus');
  await choose('[data-game="beacon-steps"]','Enter');assert.match((await state()).track,/marker at 0$/);
  return {entryTabCount:tabs,heldEntryDidNotChooseGame:true};
 });
 await check('Space hold locks a choice and commits exactly once',async()=>{
  await boot();await game('beacon-steps');await until(()=>focused('button[data-choice]'),'first legal action');
  assert.match(await focusedLabel(),/1/);const before=await state();assert.match(before.track,/marker at 0$/);
  const label=await focusedLabel(),start=Date.now();await raw('Space','keyDown');
  for(let i=0;i<9;i++){await delay(350);assert.equal((await state()).track,before.track);assert.equal(await focusedLabel(),label);if(i===2||i===5)await raw('Space','keyDown',true);}
  await raw('Space','keyUp');await delay(100);assert.match((await state()).track,/marker at 1$/);
  await delay(1500);assert.match((await state()).track,/marker at 1$/,'Focus scan must not make another move');
  return {heldMs:Date.now()-start-1600,from:0,to:1};
 });
 await check('held game-selection Enter does not make a move',async()=>{
  await boot();await until(()=>focused('[data-game="beacon-steps"]'),'game focus');await raw('Enter','keyDown');await delay(100);
  const before=await state();assert.match(before.track,/marker at 0$/);
  for(let i=0;i<5;i++){await delay(350);await raw('Enter','keyDown',true);assert.equal((await state()).track,before.track);}
  await raw('Enter','keyUp');await choose('button[data-choice]','Enter');assert.match((await state()).track,/marker at 1$/);
 });
 await check('private Enter repeat cannot open the next hand',async()=>{
  await boot();await game('pocket-signals');await choose('#reveal-hand');await until(()=>focused('button[data-choice]'),'private choice');
  await raw('Enter','keyDown');await delay(100);
  for(let i=0;i<5;i++){await delay(350);await raw('Enter','keyDown',true);assert.equal((await state()).hand,false);assert.equal((await state()).handoff,true);}
  await raw('Enter','keyUp');assert.equal((await state()).hand,false);
  await choose('#reveal-hand');assert.equal((await state()).hand,true);
 });
 await check('a second held activation key cannot cross the private gate',async()=>{
  await boot();await game('pocket-signals');await choose('#reveal-hand');await until(()=>focused('button[data-choice]'),'private choice');
  await raw('Enter','keyDown');await delay(100);await raw('Space','keyDown');
  await raw('Enter','keyUp');await delay(1600);assert.equal((await state()).hand,false);
  await raw('Space','keyUp');await delay(100);assert.equal((await state()).hand,false);
  await choose('#reveal-hand');assert.equal((await state()).hand,true);
 });
 await check('Cover Pause Resume and Menu preserve privacy',async()=>{
  await boot();await game('pocket-signals');await choose('#reveal-hand');await choose('#cover-hand');
  assert.equal((await state()).hand,false);await choose('#reveal-hand');await choose('#one-key-pause');
  assert.equal((await state()).hand,false);assert.equal((await state()).phase,'paused');assert.equal(await focused('#one-key-pause'),true);
  await delay(3000);assert.equal(await focused('#one-key-pause'),true);assert.equal((await state()).hand,false);
  await b.key('Space');await delay(100);assert.equal(await focused('#reveal-hand'),true);assert.equal((await state()).hand,false);
  await delay(1100);assert.equal(await focused('#reveal-hand'),true,'Resume must start a full dwell');
  await until(async()=>{assert.equal((await state()).hand,false,'Resume to Pace must stay covered');return focused('#one-key-pace');},'covered path to Pace');
  for(const seconds of [2.4,4,1.4]){await b.key('Space');await delay(100);assert.equal((await state()).hand,false);assert.equal(await focusedLabel(),'Pace: '+seconds+' seconds');}
  await choose('#reveal-hand');await choose('#one-key-menu');assert.equal(await visible('#one-key-setup-title'),true);assert.equal((await state()).hand,false);
 });
 await check('Pace preserves the hand and uses a full new interval',async()=>{
  await boot();await game('pocket-signals');await choose('#reveal-hand');await until(()=>focused('#one-key-pace'),'Pace focus');const measured=[];
  for(const ms of [2400,4000,1400]){
   await b.key('Space');const start=Date.now();await delay(100);
   assert.equal(await focused('#one-key-pace'),true);assert.equal((await state()).hand,true);
   assert.equal(await focusedLabel(),'Pace: '+ms/1000+' seconds');
   await delay(ms-300);assert.equal(await focused('#one-key-pace'),true,'Pace interval too short');
   await until(async()=>!await focused('#one-key-pace'),'Pace advance',1200);
   const elapsedMs=Date.now()-start;assert.ok(elapsedMs>=ms-80&&elapsedMs<ms+1200);measured.push({expectedMs:ms,elapsedMs});
   if(ms!==1400)await until(()=>focused('#one-key-pace'),'next Pace cycle');
  }
  return measured;
 });
 await check('Exit covers the hand and returns to a non-action heading',async()=>{
  const evidence=[];
  for(const resumeFirst of [false,true]){
   await boot();await game('pocket-signals');await choose('#reveal-hand');
   if(resumeFirst){await choose('#one-key-pause');await b.key('Space');await delay(100);assert.equal((await state()).hand,false);}
   await until(async()=>{if(resumeFirst)assert.equal((await state()).hand,false,'Resume to Exit must stay covered');return focused('#one-key-exit');},'Exit focus');
   await raw('Enter','keyDown');await delay(100);
   for(let i=0;i<3;i++){await raw('Enter','keyDown',true);await delay(100);}
   await raw('Enter','keyUp');const after=await state();assert.equal(after.hand,false);assert.notEqual(after.hash,'#one-key');assert.equal(after.focus,'table-title');
   assert.equal(await visible('#one-key-entry'),true);evidence.push({resumeFirst,after});
  }
  return evidence;
 });
 await check('real window blur cancels Space and resumes with a fresh dwell',async()=>{
  await boot();await game('beacon-steps');await until(()=>focused('button[data-choice]'),'choice focus');
  const before=await state();await raw('Space','keyDown');
  const original=(await b.send('Target.getTargetInfo')).targetInfo.targetId,other=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;
  try{
   await b.send('Target.activateTarget',{targetId:other});await until(async()=>!await evaluate('document.hasFocus()'),'real window blur');await delay(1600);
   await b.send('Target.activateTarget',{targetId:original});await b.send('Page.bringToFront');await until(()=>evaluate('document.hasFocus()'),'window focus restored');
   await raw('Space','keyUp');await delay(100);assert.equal((await state()).track,before.track,'Cancelled Space must not commit after return');
   await delay(1100);assert.equal((await state()).track,before.track);
   await choose('button[data-choice]');assert.notEqual((await state()).track,before.track);
  }finally{await b.send('Target.closeTarget',{targetId:other});}
 });
 await check('every visible play button is reached without activation',async()=>{
  const evidence=[];
  for(const phase of ['setup','beacon','handoff','hand']){
   await boot();if(phase!=='setup')await game(phase==='beacon'?'beacon-steps':'pocket-signals');if(phase==='hand')await choose('#reveal-hand');
   const read=()=>evaluate('(()=>{const buttons=[...document.querySelectorAll("button")].filter(e=>!e.disabled&&e.getClientRects().length);return {count:buttons.length,index:buttons.indexOf(document.activeElement),highlight:document.activeElement.classList.contains("one-key-current")};})()');
   const before=await state(),initial=await read(),seen=new Set(),deadline=Date.now()+(initial.count+2)*1500;
   while(Date.now()<deadline&&seen.size<initial.count){const now=await read();assert.equal(now.count,initial.count);if(now.index>=0){assert.equal(now.highlight,true);seen.add(now.index);}await delay(80);}
   assert.equal(seen.size,initial.count,'Every visible unpaused button must enter the focus cycle');
   const after=await state();assert.equal(after.hand,before.hand);assert.equal(after.track,before.track);assert.equal(after.terminal,before.terminal);
   assert.equal(await visible('#workshop-tab'),false);evidence.push({phase,visibleButtons:initial.count,reached:seen.size});
  }
  return evidence;
 });
 await check('destroy removes timers and activation-key capture',async()=>{
  await boot();await until(()=>focused('[data-game]'),'fixture entry');
  await evaluate('(async()=>{const {mountApp}=await import("/src/app.js");window.__oneKeyFixture=mountApp(document.getElementById("app"),{oneKey:true});return true;})()');
  await raw('Enter','keyDown');
  await evaluate('(()=>{window.__oneKeyFixture.destroy();delete window.__oneKeyFixture;const button=document.createElement("button");button.id="fixture-button";button.textContent="Receiving-only native button";button.dataset.clicks="0";button.addEventListener("click",()=>button.dataset.clicks=String(Number(button.dataset.clicks)+1));document.getElementById("app").append(button);button.focus();return true;})()');
  await raw('Enter','keyDown');await raw('Enter','keyDown',true);await raw('Enter','keyUp');
  assert.equal(await evaluate('document.getElementById("fixture-button").dataset.clicks'),'2');
  await delay(1600);assert.equal(await focused('#fixture-button'),true);
  return {fixtureOnly:true,nativeActivationsAfterDestroy:2};
 });
 await check('desktop and 320px runtime controls fit the viewport',async()=>{
  await boot();await game('pocket-signals');await choose('#reveal-hand');await until(()=>focused('button[data-choice]'),'visible action');
  const desktop=await b.screenshot('one-key-desktop.png');
  await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
  await boot();await game('pocket-signals');await choose('#reveal-hand');await until(()=>focused('#one-key-pause'),'narrow controls');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  const narrow=await b.screenshot('one-key-320.png');
  return {desktop,narrow,visualReviewRequired:true};
 });
 assert.equal(receipt.checks.length,16,'All required receiving cases must run');
 assert.equal(receipt.observations.every(o=>o.passed),true);assert.deepEqual(b.errors,[]);receipt.ok=true;
}catch(error){receipt.ok=false;receipt.failure=error.stack||String(error);process.exitCode=1;}
finally{
 if(b){receipt.browserErrors=[...b.errors];await b.close();if(receipt.browserErrors.length){receipt.ok=false;process.exitCode=1;}}
 if(server)await new Promise((resolveClose,reject)=>server.close(e=>e?reject(e):resolveClose()));
 receipt.finishedAt=new Date().toISOString();await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
