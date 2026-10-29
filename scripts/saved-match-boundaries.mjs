import assert from 'node:assert/strict';
import {launchBrowser} from './browser-driver.mjs';
import {createAppServer} from '../server.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),arg=n=>{const i=args.indexOf(n);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+n);return args[i+1];};
const file=arg('--file')&&resolve(arg('--file')),externalUrl=arg('--url'),out=resolve(arg('--output')||'receiving/saved-boundaries-'+randomUUID()),KEY='open-table.saved-match.v1',q=JSON.stringify;
if(file&&externalUrl)throw Error('Choose --file or --url');
await mkdir(out,{recursive:true});
const receipt={schema:'open-table.saved-match-boundaries.v1',startedAt:new Date().toISOString(),mode:file?'standalone-offline':externalUrl?'package-http':'source-http',checks:[],screenshots:[]};
let server,b;
async function check(name,run){await run();receipt.checks.push(name);}
async function reload(){
 await b.evaluate('window.__savedBoundaryReload=true');await b.send('Page.reload');
 const until=Date.now()+10000;while(Date.now()<until){try{if(await b.evaluate("!window.__savedBoundaryReload&&document.readyState==='complete'&&!!document.querySelector('#saved-match-panel')"))return;}catch{}await new Promise(r=>setTimeout(r,50));}
 throw Error('Reload did not return ordinary saved-match panel');
}
const read=()=>b.evaluate('localStorage.getItem('+q(KEY)+')');
const status=()=>b.evaluate("document.querySelector('[data-testid=saved-match-status]').textContent");
const position=()=>b.evaluate("document.querySelector('.track').getAttribute('aria-label')");
const focus=selector=>b.evaluate('document.querySelector('+q(selector)+').focus();true');
const settle=()=>b.evaluate('(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true;})()');
async function press(input){await b.key(input);await settle();}
async function save(){await b.click('#save-match');await b.click('#match-confirm');}
async function changedRecord(){
 return b.evaluate('(()=>{const key='+q(KEY)+',r=JSON.parse(localStorage.getItem(key));r.savedAt=r.savedAt==="2026-10-28T00:00:00.000Z"?"2026-10-27T00:00:00.000Z":"2026-10-28T00:00:00.000Z";const raw=JSON.stringify(r);localStorage.setItem(key,raw);return raw;})()');
}
async function covered(){
 assert.equal(await b.evaluate("!!document.querySelector('#reveal-hand')&&!document.querySelector('#private-title')&&!document.querySelector('[data-choice]')&&!document.querySelector('[data-testid=private-hand]')"),true);
 assert.equal((await b.axTree()).some(n=>!n.ignored&&/^Card [1-5],/.test(n.name?.value||'')),false);
}
async function key(type,key='Enter',repeat=false){
 await b.send('Input.dispatchKeyEvent',{type,key:key==='Space'?' ':key,code:key,windowsVirtualKeyCode:key==='Space'?32:13,nativeVirtualKeyCode:key==='Space'?32:13,...(type==='keyDown'?{text:key==='Space'?' ':'\r',unmodifiedText:key==='Space'?' ':'\r'}:{}),...(repeat?{autoRepeat:true}:{})});
 if(type==='keyUp')await settle();
}
try{
 let config={screenshotDir:out,width:1280,height:980};
 if(file)config={...config,filePath:file,artifactRoot:dirname(file),offline:true,hash:''};
 else if(externalUrl)config.url=externalUrl;
 else{server=createAppServer();await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});config.url='http://127.0.0.1:'+server.address().port+'/';}
 b=await launchBrowser(config);receipt.browser=await b.send('Browser.getVersion');
 let validRaw;
 await check('Save cancellation keeps current game and empty slot',async()=>{
  await b.click('[data-choice="1"]');const before=await position();
  await b.click('#save-match');assert.equal(await b.evaluate('document.activeElement.id'),'match-cancel');
  await press('Escape');assert.equal(await position(),before);assert.equal(await read(),null);
  assert.equal(await b.evaluate('document.activeElement.id'),'save-match');await save();validRaw=await read();
 });
 await check('Changed save, resume and forget slots reject stale confirmations',async()=>{
  for(const selector of ['#save-match','#resume-match','#forget-match']){
   const before=await position();await b.click(selector);const competing=await changedRecord();await b.click('#match-confirm');
   assert.equal(await read(),competing);assert.equal(await position(),before);assert.match(await status(),/changed/);
  }
 });
 await check('Corrupt and incompatible saves remain intact until an explicit choice',async()=>{
  for(const raw of ['{"schema":',JSON.stringify({...JSON.parse(validRaw),rulesetPin:'different-build'})]){
   await b.evaluate('localStorage.setItem('+q(KEY)+','+q(raw)+');true');await reload();
   assert.equal(await read(),raw);assert.equal(await b.evaluate("document.querySelector('#resume-match').disabled"),true);
   assert.match(await status(),/could not be read|different Open Table build/);
   await b.click('#forget-match');await b.click('#match-cancel');assert.equal(await read(),raw);
  }
  await save();validRaw=await read();assert.ok(validRaw);
 });
 await check('Quota failure leaves prior save and live state intact without success',async()=>{
  await b.click('[data-choice="0"]');const before=await position(),raw=await read();
  await b.evaluate("window.__savedNativeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==="+q(KEY)+")throw new DOMException('Fixture quota','QuotaExceededError');return window.__savedNativeSet.call(this,k,v);};true");
  await save();assert.equal(await position(),before);assert.equal(await read(),raw);assert.match(await status(),/refused|not confirmed/);assert.doesNotMatch(await status(),/Snapshot saved/);
  await b.evaluate("Storage.prototype.setItem=window.__savedNativeSet;delete window.__savedNativeSet;true");
 });
 await check('Post-write verification failure is explicit and does not roll back',async()=>{
  await b.evaluate("window.__savedNativeSet=Storage.prototype.setItem;window.__savedNativeGet=Storage.prototype.getItem;Storage.prototype.setItem=function(k,v){window.__savedNativeSet.call(this,k,v);if(k==="+q(KEY)+")Storage.prototype.getItem=function(key){if(key==="+q(KEY)+")throw new DOMException('Fixture verify','SecurityError');return window.__savedNativeGet.call(this,key);};};true");
  await save();assert.match(await status(),/could not be verified/);assert.doesNotMatch(await status(),/Snapshot saved/);
  await b.evaluate("Storage.prototype.setItem=window.__savedNativeSet;Storage.prototype.getItem=window.__savedNativeGet;delete window.__savedNativeSet;delete window.__savedNativeGet;true");
  assert.ok(await read());await reload();
 });
 await check('Unavailable storage getter leaves the game usable',async()=>{
  const injected=await b.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('Fixture denied','SecurityError');}});"});
  try{await reload();assert.match(await status(),/unavailable/);assert.equal(await b.evaluate("document.querySelector('#save-match').disabled"),true);await b.click('[data-choice="0"]');assert.match(await position(),/marker at 1$/);}
  finally{await b.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected.identifier});await reload();}
 });
 await check('An external slot change clears prior success and reports the current problem',async()=>{
  await save();assert.match(await status(),/Snapshot saved/);
  await b.evaluate('localStorage.setItem('+q(KEY)+',"{");true');await b.click('[data-choice="0"]');
  assert.match(await status(),/could not be read/);assert.doesNotMatch(await status(),/Snapshot saved/);await save();
 });
 // Create a real P2 handoff snapshot through ordinary controls.
 await b.click('[data-game="pocket-signals"]');await b.click('#reveal-hand');await b.click('[data-choice="0"]');await save();
 const pocket=await read();
 await b.click('#one-key-entry');await b.click('[data-game="pocket-signals"]');
 await check('One-key menu is reachable with a fresh Space press and Back preserves match',async()=>{
  await focus('#match-menu');await press('Space');assert.equal(await b.evaluate('document.activeElement.id'),'match-back');
  assert.equal(await read(),pocket);await press('Enter');await covered();assert.equal(await read(),pocket);
  assert.equal(await b.evaluate('document.activeElement.id'),'reveal-hand');
 });
 await check('Hidden replacement confirmation retains only its own one-key targets',async()=>{
  const before=await b.evaluate("document.querySelector('[data-testid=board]').textContent"),raw=await read();
  await b.click('#match-menu');await b.click('#save-match');
  assert.equal(await b.evaluate('document.activeElement.id'),'match-cancel');
  assert.equal(await b.evaluate("document.querySelector('#match-confirm').textContent"),'Replace snapshot');
  const appTarget=(await b.send('Target.getTargetInfo')).targetInfo.targetId;
  const otherTarget=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;
  const state=()=>b.evaluate("({hidden:document.hidden,visibility:document.visibilityState,focus:document.activeElement.id,confirmation:!!document.querySelector('#match-confirmation'),privateVisible:!!document.querySelector('[data-testid=private-hand]'),choices:document.querySelectorAll('[data-choice]').length,ordinaryScan:!!document.querySelector('#toggle-scan')})");
  const waitVisibility=async hidden=>{
   const deadline=Date.now()+4000;while(Date.now()<deadline){const current=await state();if(current.hidden===hidden&&current.visibility===(hidden?'hidden':'visible'))return current;await new Promise(r=>setTimeout(r,40));}
   throw Error('App target visibility did not become '+(hidden?'hidden':'visible'));
  };
  const observations={hiddenSamples:0,visibleSamples:0,focusedTargets:[]};
  try{
   await b.send('Target.activateTarget',{targetId:otherTarget});await waitVisibility(true);
   const hiddenUntil=Date.now()+1800;
   while(Date.now()<hiddenUntil){
    const current=await state();assert.equal(current.hidden,true);assert.equal(current.confirmation,true);
    assert.equal(current.privateVisible,false);assert.equal(current.choices,0);assert.equal(current.ordinaryScan,false);assert.equal(await read(),raw);
    observations.hiddenSamples++;await new Promise(r=>setTimeout(r,100));
   }
   await b.send('Target.activateTarget',{targetId:appTarget});await waitVisibility(false);
   const visibleUntil=Date.now()+3200;
   while(Date.now()<visibleUntil){
    const current=await state();assert.equal(current.hidden,false);assert.equal(current.confirmation,true);
    assert.ok(['match-cancel','match-confirm'].includes(current.focus));assert.equal(current.privateVisible,false);assert.equal(current.choices,0);assert.equal(current.ordinaryScan,false);assert.equal(await read(),raw);
    if(!observations.focusedTargets.includes(current.focus))observations.focusedTargets.push(current.focus);
    observations.visibleSamples++;await new Promise(r=>setTimeout(r,100));
   }
   assert.deepEqual(new Set(observations.focusedTargets),new Set(['match-cancel','match-confirm']));
   await focus('#match-cancel');await press('Space');
   assert.equal(await b.evaluate("!!document.querySelector('#match-back')"),true);
   assert.equal(await b.evaluate('document.activeElement.id'),'save-match');assert.equal(await read(),raw);
   await b.click('#match-back');await covered();
   assert.equal(await b.evaluate("document.querySelector('[data-testid=board]').textContent"),before);
   receipt.hiddenConfirmation=observations;
  }finally{
   await b.send('Target.closeTarget',{targetId:otherTarget});await b.send('Target.activateTarget',{targetId:appTarget});
  }
 });
 await check('Held Enter opens confirmation without accepting it',async()=>{
  await b.click('#match-menu');await focus('#resume-match');await key('keyDown');
  assert.equal(await b.evaluate("!!document.querySelector('#match-confirmation')"),true);
  await key('keyDown','Enter',true);assert.equal(await b.evaluate("!!document.querySelector('#match-confirmation')"),true);
  await key('keyUp');assert.equal(await b.evaluate('document.activeElement.id'),'match-cancel');
  await press('Enter');assert.equal(await b.evaluate("!!document.querySelector('#match-back')"),true);
 });
 await check('Space release accepts resume once and cannot reveal the restored private hand',async()=>{
  await focus('#resume-match');await key('keyDown','Space');await key('keyDown','Space',true);assert.equal(await b.evaluate("!!document.querySelector('#match-confirmation')"),false);
  await key('keyUp','Space');assert.equal(await b.evaluate("!!document.querySelector('#match-confirmation')"),true);
  await focus('#match-confirm');await key('keyDown','Space');await key('keyDown','Space',true);
  assert.equal(await b.evaluate("!!document.querySelector('#match-confirmation')"),true);
  await key('keyUp','Space');await covered();assert.equal(await b.evaluate("document.querySelector('.player-tag').textContent.trim()"),'Player 2 to move');
  await key('keyDown','Space',true);await key('keyUp','Space');await covered();
  await key('keyUp','Space');await covered();
  await focus('#reveal-hand');await press('Space');
  assert.equal(await b.evaluate("!!document.querySelector('[data-testid=private-hand]')"),true);
  await b.click('#cover-hand');
 });
 await check('One-key save, cancel, resume and forgetting preserve explicit snapshot semantics',async()=>{
  await b.click('#match-menu');await focus('#save-match');await press('Enter');await focus('#match-confirm');await press('Enter');
  assert.equal(await b.evaluate("!!document.querySelector('#match-back')"),true);const saved=await read();
  await b.click('#match-back');await covered();await b.click('#reveal-hand');await b.click('[data-choice="0"]');await b.click('#match-menu');
  await b.click('#resume-match');await press('Enter');assert.equal(await read(),saved);
  await b.click('#resume-match');await focus('#match-confirm');await press('Enter');await covered();
  assert.equal(await b.evaluate("document.querySelector('.player-tag').textContent.trim()"),'Player 2 to move');
  await b.click('#match-menu');await b.click('#forget-match');await press('Enter');assert.equal(await read(),saved);
  await b.click('#forget-match');await focus('#match-confirm');await press('Enter');assert.equal(await read(),null);
  await b.click('#match-back');await covered();assert.equal(await b.evaluate("document.querySelector('.player-tag').textContent.trim()"),'Player 2 to move');
 });
 await check('Narrow one-key confirmation keeps both actions readable and reachable',async()=>{
  await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
  await b.click('#match-menu');await b.click('#save-match');
  const geometry=await b.evaluate("({width:innerWidth,scroll:document.documentElement.scrollWidth,buttons:['match-cancel','match-confirm'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};})})");
  assert.ok(geometry.scroll<=geometry.width);assert.ok(geometry.buttons.every(r=>r.x>=0&&r.x+r.width<=320&&r.y>=0&&r.bottom<=900&&r.height>=44));receipt.confirmationGeometry=geometry;
  receipt.screenshots.push(await b.screenshot('one-key-confirmation-320.png'));await press('Escape');
 });
 assert.deepEqual(b.errors,[]);receipt.ok=true;
}catch(error){receipt.ok=false;receipt.failure=String(error.stack||error);process.exitCode=1;if(b)await b.screenshot('failure.png').catch(()=>{});}
finally{
 receipt.browserErrors=b?.errors||[];if(b){try{await b.close();receipt.browserClosed=true;}catch(error){receipt.ok=false;receipt.cleanupError=String(error);process.exitCode=1;}}
 if(server)await new Promise(r=>server.close(r));receipt.finishedAt=new Date().toISOString();
 await writeFile(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({ok:receipt.ok,checks:receipt.checks.length,failure:receipt.failure,receipt:resolve(out,'receipt.json')}));
}
