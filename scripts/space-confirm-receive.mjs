import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAppServer} from '../server.mjs';
import {launchBrowser} from './browser-driver.mjs';

const output=resolve(process.env.OPEN_TABLE_SPACE_DIR||'receiving/space-confirm');
try{await access(output+'/receipt.json');throw new Error('Use a fresh Space receiving directory.');}
catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const externalURL=process.env.OPEN_TABLE_RECEIVING_URL,server=externalURL?null:createAppServer();
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=externalURL||'http://127.0.0.1:'+server.address().port+'/';
const receipt={schema:'open-table.space-confirm-receiving.v1',startedAt:new Date().toISOString(),
 appSHA256:createHash('sha256').update(await readFile(new URL('../src/app.js',import.meta.url))).digest('hex'),
 checks:[],observations:[]};
let b;
const space={key:' ',code:'Space',windowsVirtualKeyCode:32,text:' ',unmodifiedText:' '};
const key=(type,repeat=false)=>b.send('Input.dispatchKeyEvent',{...space,type,...(repeat?{autoRepeat:true}:{})});
const focus=selector=>b.evaluate('document.querySelector('+JSON.stringify(selector)+').focus();true');
async function state(){
 return b.evaluate("(()=>{const q=s=>document.querySelector(s);return {position:q('.track')?.getAttribute('aria-label')||null,focus:document.activeElement.id,documentFocused:document.hasFocus(),covered:!!q('#reveal-hand'),privateVisible:!!q('#private-title'),choice:q('#confirm-choice')?.textContent||null,toggle:q('#toggle-scan')?.getAttribute('aria-pressed')||null,rounds:q('.rounds')?.textContent||'',live:q('[data-testid=public-live]')?.textContent||''};})()");
}
async function mount(game='beacon-steps',{scan=true}={}){
 await b.evaluate("(async()=>{const g=await import('/src/games.js'),a=await import('/src/app.js');const game="+JSON.stringify(game)+";const initial=game==='pocket-signals'?g.initialStates(game).find(s=>JSON.stringify(s.hands)==='[[2,4],[1,3]]'):g.initialStates(game)[0];a.mountApp(document.getElementById('app'),{gameId:game,initialState:initial});return true;})()");
 await b.click('[data-pack="switch-select"]');
 if(game==='pocket-signals')await b.click('#reveal-hand');
 if(scan)await b.click('#toggle-scan');else await focus('#confirm-choice');
}
async function heldFor(ms,{repeat=false}={}){
 const before=await state(),samples=[],started=Date.now(),end=started+ms;
 if(before.position!==null)assert.match(before.position,/marker at 0$/);
 assert.equal(before.focus,'confirm-choice');
 while(Date.now()<end){
  await delay(Math.min(350,Math.max(1,end-Date.now())));
  if(repeat)await key('keyDown',true);
  const s=await state();samples.push(s.choice);
  assert.equal(s.choice,before.choice,'Choice drifted during the Space hold');
  assert.equal(s.position,before.position,'Space down made a move before release');
  assert.equal(s.rounds,before.rounds,'Space down committed a private choice before release');
 }
 return {before,samples,elapsedMs:Date.now()-started};
}
async function scanResumes(before){
 const end=Date.now()+2000;
 while(Date.now()<end){const s=await state();if(s.choice!==before.choice)return s;await delay(50);}
 assert.fail('Scanning did not resume after cancelled Space activation');
}
async function check(name,run){
 const evidence=await run();receipt.checks.push(name);receipt.observations.push({check:name,evidence,state:await state()});
}
try{
 b=await launchBrowser({url,screenshotDir:output});
 receipt.servedAppSHA256=await b.evaluate("(async()=>{const r=await fetch('/src/app.js');if(!r.ok)throw new Error('App source fetch failed');return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');})()");
 assert.equal(receipt.servedAppSHA256,receipt.appSHA256,'Served source differs from received package');
 await check('Space holds one Beacon choice across multiple scan ticks and releases exactly once',async()=>{
  await mount();await key('keyDown');const evidence=await heldFor(3100);
  assert.match(evidence.before.choice,/Advance 1/);await b.screenshot('space-held.png');await key('keyUp');
  assert.match((await state()).position,/marker at 1$/);await delay(100);assert.match((await state()).position,/marker at 1$/);
  return evidence;
 });
 await check('Repeated Space keydowns keep the original choice without committing early',async()=>{
  await mount();await key('keyDown');const evidence=await heldFor(1750,{repeat:true});await key('keyUp');
  assert.match((await state()).position,/marker at 1$/);return evidence;
 });
 await check('A held private choice commits the selected card and stays covered until a fresh reveal',async()=>{
  await mount('pocket-signals');await key('keyDown');const evidence=await heldFor(1750,{repeat:true});
  assert.match(evidence.before.choice,/Commit 2$/);await key('keyUp');await delay(1500);
  const covered=await state();assert.equal(covered.covered,true);assert.equal(covered.privateVisible,false);assert.equal(covered.rounds,'');
  assert.ok(!/Commit card/.test(covered.live));
  const names=(await b.axTree()).filter(n=>!n.ignored).map(n=>n.name?.value||'');
  assert.ok(!names.some(x=>/^Card [1-5],/.test(x)));
  await b.key('Enter');assert.equal((await state()).privateVisible,true);await b.key('Enter');
  assert.match((await state()).rounds,/P1 played 2 · P2 played 1/);return {...evidence,covered};
 });
 await check('Tab cancels the held activation and automatic scanning resumes',async()=>{
  await mount();await key('keyDown');await heldFor(1500);await b.key('Tab');await key('keyUp');
  const before=await state();assert.notEqual(before.focus,'confirm-choice');assert.match(before.position,/marker at 0$/);assert.equal(before.toggle,'true');
  const resumed=await scanResumes(before);assert.match(resumed.position,/marker at 0$/);return {before,resumed};
 });
 await check('A cancelled native keyup resumes scanning without making a move',async()=>{
  await mount();await key('keyDown');await heldFor(1500);
  await b.evaluate("document.addEventListener('keyup',e=>{if(e.key===' ')e.preventDefault();},{capture:true,once:true});true");
  await key('keyUp');const before=await state();assert.match(before.position,/marker at 0$/);
  const resumed=await scanResumes(before);assert.match(resumed.position,/marker at 0$/);
  await b.click('#toggle-scan');await b.click('#confirm-choice');assert.match((await state()).position,/marker at 2$/);
  return {before,resumed};
 });
 await check('Manual pause remains paused through a Space hold, release and blur',async()=>{
  await mount('beacon-steps',{scan:false});await key('keyDown');await heldFor(1700);await key('keyUp');
  const before=await state();assert.match(before.position,/marker at 1$/);assert.equal(before.toggle,'false');
  await focus('#confirm-choice');await key('keyDown');await b.key('Tab');await key('keyUp');await delay(1600);
  const after=await state();assert.match(after.position,/marker at 1$/);assert.equal(after.choice,before.choice);assert.equal(after.toggle,'false');
  return {before,after};
 });
 await check('Reset while Space is held cannot apply the old release to the new game',async()=>{
  await mount();await key('keyDown');await heldFor(1500);await b.click('[data-game="beacon-steps"]');assert.match((await state()).position,/marker at 0$/);await key('keyUp');
  const afterReset=await state();assert.match(afterReset.position,/marker at 0$/);await b.key('Space');
  assert.match((await state()).position,/marker at 1$/);return {afterReset};
 });
 await check('An Enter confirmation while Space is held cannot leak the next private hand on Space release',async()=>{
  await mount('pocket-signals');await key('keyDown');await b.key('Enter');
  assert.equal((await state()).covered,true);await key('keyUp');const covered=await state();
  assert.equal(covered.covered,true);assert.equal(covered.privateVisible,false);assert.equal(covered.rounds,'');return {covered};
 });
 await check('Real browser focus loss cancels the hold and permits a fresh confirmation',async()=>{
  await mount();await key('keyDown');const before=await state();
  const original=(await b.send('Target.getTargetInfo')).targetInfo.targetId;
  const other=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;
  let lost,resumed,returned;
  try{
   await b.send('Target.activateTarget',{targetId:other});await delay(100);lost=await state();
   assert.equal(lost.documentFocused,false,'Browser did not move focus to the owned blank tab');
   resumed=await scanResumes(before);assert.match(resumed.position,/marker at 0$/);
   await b.send('Target.activateTarget',{targetId:original});await b.send('Page.bringToFront');
   assert.equal((await state()).documentFocused,true,'Browser did not restore original focus');
   await key('keyUp');returned=await state();assert.match(returned.position,/marker at 0$/);
  }finally{await b.send('Target.closeTarget',{targetId:other});}
  await b.click('#toggle-scan');const selected=await state();await focus('#confirm-choice');await b.key('Space');
  assert.match((await state()).position,new RegExp('marker at '+(/Advance 2/.test(selected.choice)?2:1)+'$'));
  return {lost,resumed,returned};
 });
 await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
 await mount('beacon-steps',{scan:false});await b.evaluate("document.querySelector('.scan-hint').scrollIntoView({block:'center'});true");
 await b.screenshot('space-hint-320.png');
 const layout=await b.evaluate("({viewport:innerWidth,scroll:document.documentElement.scrollWidth,hint:document.querySelector('.scan-hint').textContent})");
 assert.ok(layout.scroll<=layout.viewport,'Space guidance causes horizontal overflow');receipt.layout=layout;
 assert.deepEqual(b.errors,[]);receipt.ok=true;
}catch(error){
 receipt.ok=false;receipt.failure={message:error.message,stack:error.stack};
 if(b){receipt.lastState=await state().catch(()=>null);await b.screenshot('failure.png').catch(()=>{});}
 throw error;
}finally{
 receipt.finishedAt=new Date().toISOString();receipt.browserErrors=b?.errors||[];
 await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(receipt));await b?.close();if(server)await new Promise(r=>server.close(r));
}
