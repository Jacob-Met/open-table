import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {resolve} from 'node:path';
import {createAppServer} from '../server.mjs';
import {launchBrowser} from './browser-driver.mjs';
const output=resolve(process.env.OPEN_TABLE_RECEIVING_DIR||'receiving/browser-qualified'),downloads=output+'/downloads';
await mkdir(downloads,{recursive:true});
const externalURL=process.env.OPEN_TABLE_RECEIVING_URL;
const server=externalURL?null:createAppServer();if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
let b;const receipt={checks:[],screenshots:[],startedAt:new Date().toISOString()};
async function check(name,run){await run();receipt.checks.push(name);}
async function waitFor(read,label){const end=Date.now()+5000;while(Date.now()<end){const v=await read();if(v)return v;await delay(50);}throw new Error('Timed out: '+label);}
async function mountFixture({game='pocket-signals',pending=null}={}){
 const g=await import('/src/games.js'),app=await import('/src/app.js');
 let initial=game==='beacon-steps'?g.initialStates(game)[0]:g.initialStates(game).find(s=>JSON.stringify(s.hands)===JSON.stringify([[2,4],[1,3]]));
 if(pending!==null)initial=g.step(initial,{type:'commit',player:0,card:pending});
 app.mountApp(document.getElementById('app'),{gameId:game,initialState:initial});return true;
}
const mount=args=>b.evaluate('('+mountFixture.toString()+')('+JSON.stringify(args)+')');
const snapshot=()=>b.evaluate('({covered:!!document.querySelector("#reveal-hand"),privateVisible:!!document.querySelector("#private-title"),comparison:!!document.querySelector("[data-testid=choice-comparison]"),focus:document.activeElement.id})');
const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'};
async function upload(path){
 const {root}=await b.send('DOM.getDocument');
 const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
 await b.send('DOM.setFileInputFiles',{nodeId,files:[path]});
}
try{
 b=await launchBrowser({url:externalURL||'http://127.0.0.1:'+server.address().port+'/',screenshotDir:output});
 await check('Real HTTP entry point, selected ARIA states and visible active choice',async()=>{
  assert.equal(await b.evaluate('document.querySelector("#table-title").textContent'),'Beacon Steps');
  assert.equal(await b.evaluate('document.querySelector("[data-game=beacon-steps]").getAttribute("aria-pressed")'),'true');
  assert.equal(await b.evaluate('document.querySelector("[data-game=pocket-signals]").getAttribute("aria-pressed")'),'false');
  assert.equal(await b.evaluate('getComputedStyle(document.querySelector("[data-game=beacon-steps]")).backgroundColor'),'rgb(29, 71, 62)');
  assert.equal(await b.evaluate('document.querySelector("#play-tab").getAttribute("aria-pressed")'),'true');
 });
 receipt.screenshots.push(await b.screenshot('desktop-table.png'));
 await check('Beacon mouse and keyboard play reaches exact seven and stops',async()=>{
  await b.click('[data-choice="1"]');
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/marker at 2/);
  await b.evaluate('document.querySelector("[data-choice=\'1\']").focus();true');
  await b.key('Enter');
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/marker at 4/);
  await b.click('[data-choice="1"]');
  assert.equal(await b.evaluate('document.querySelectorAll("[data-choice]").length'),1);
  await b.evaluate('document.querySelector("[data-choice=\'0\']").focus();true');await b.key('Space');
  assert.match(await b.evaluate('document.querySelector(".end-result").textContent'),/Player 2 takes it/);
  assert.equal(await b.evaluate('document.querySelectorAll("[data-choice]").length'),0);
 });
 await check('Scanning changes selection without moving; explicit confirmation moves once',async()=>{
  await b.click('#new-game');await b.click('[data-pack="switch-select"]');
  await b.click('#next-choice');
  assert.match(await b.evaluate('document.querySelector("#confirm-choice").textContent'),/Advance 2/);
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/marker at 0/);
  const before=await b.evaluate('document.querySelector("#confirm-choice").textContent');
  await b.click('#toggle-scan');
  await waitFor(async()=>await b.evaluate('document.querySelector("#confirm-choice").textContent')!==before,'automatic scan advances');
  await b.click('#toggle-scan');
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/marker at 0/);
  await b.evaluate('document.querySelector("#confirm-choice").focus();true');await b.key('Enter');
  assert.match(await b.evaluate('document.querySelector(".track").getAttribute("aria-label")'),/marker at 1/);
 });
 await check('Held/repeated Enter cannot reveal the next private hand; a fresh press can',async()=>{
  await mount({});await b.click('[data-pack="switch-select"]');await b.click('#reveal-hand');
  await b.evaluate('document.querySelector("#confirm-choice").focus();true');
  await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown'});
  assert.deepEqual(await snapshot(),{covered:true,privateVisible:false,comparison:false,focus:'reveal-hand'});
  await b.send('Input.dispatchKeyEvent',{...enter,type:'keyDown',autoRepeat:true});
  assert.deepEqual(await snapshot(),{covered:true,privateVisible:false,comparison:false,focus:'reveal-hand'});
  await b.send('Input.dispatchKeyEvent',{...enter,type:'keyUp'});
  await b.key('Enter');
  assert.equal((await snapshot()).privateVisible,true);
  assert.equal(await b.evaluate('document.querySelector("#private-title").textContent'),'Player 2 · your private hand · round 1');
  const names=(await b.axTree()).filter(n=>!n.ignored).map(n=>n.name?.value||'');
  assert.ok(names.includes('Card 1, circle')&&names.includes('Card 3, square'));
  assert.ok(!names.includes('Card 2, triangle')&&!names.includes('Card 4, diamond'));
 });
 await check('Space confirmation leaves the next hand covered',async()=>{
  await mount({});await b.click('[data-pack="switch-select"]');await b.click('#reveal-hand');
  await b.evaluate('document.querySelector("#confirm-choice").focus();true');await b.key('Space');
  assert.deepEqual(await snapshot(),{covered:true,privateVisible:false,comparison:false,focus:'reveal-hand'});
 });
 await check('Waiting observer DOM is identical for two different pending opponent choices',async()=>{
  const views=[],reveals=[];
  for(const pending of [2,4]){
   await mount({pending});await b.click('#reveal-hand');
   views.push(await b.evaluate('document.querySelector(".workspace").outerHTML'));
   assert.equal(await b.evaluate('document.querySelector("[data-testid=public-live]").textContent'),'');
   await b.click('[data-choice="0"]');
   reveals.push(await b.evaluate('document.querySelector(".rounds").textContent'));
   assert.match(await b.evaluate('document.querySelector("[data-testid=public-live]").textContent'),/Round 1 is complete/);
   assert.equal((await snapshot()).covered,true);
  }
  assert.equal(views[0],views[1]);
  assert.match(reveals[0],/P1 played 2 · P2 played 1/);assert.match(reveals[1],/P1 played 4 · P2 played 1/);
 });
 await check('Equal-stakes Pocket win and draw work through actual controls',async()=>{
  for(const [first,expected] of [[0,'Player 1 takes it'],[1,'A well-matched draw.']]){
   await mount({});await b.click('#reveal-hand');await b.click('[data-choice="'+first+'"]');
   for(let turn=0;turn<3;turn++){await b.click('#reveal-hand');await b.click('[data-choice="0"]');}
   assert.ok((await b.evaluate('document.querySelector(".end-result").textContent')).includes(expected));
   assert.equal(await b.evaluate('document.querySelector("[data-testid=private-hand]")!==null'),false);
  }
 });
 await check('Actual UI download contains only a pinned adaptation selection',async()=>{
  await mount({});await b.click('#reveal-hand');
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads});
  await b.click('#save-pack');
  const file=await waitFor(async()=>{const names=await readdir(downloads);return names.find(n=>n.endsWith('.json'));},'pack download');
  receipt.packPath=downloads+'/'+file;const pack=JSON.parse(await readFile(receipt.packPath,'utf8'));
  assert.deepEqual(Object.keys(pack).sort(),['adapter','classification','gameId','rulesetPin','schema'].sort());
  assert.equal(pack.gameId,'pocket-signals');assert.equal(pack.adapter,'shape-text');
  assert.match(pack.rulesetPin,/^sha256:[a-f0-9]{64}$/);
 });
 await check('Actual file-input reopen reruns the checker and covers private cards',async()=>{
  await b.click('[data-pack="switch-select"]');await upload(receipt.packPath);
  await waitFor(async()=>/checked again/.test(await b.evaluate('document.querySelector("[data-testid=pack-status]").textContent')),'pack reopen');
  assert.equal(await b.evaluate('document.querySelector("[data-pack=shape-text]").getAttribute("aria-pressed")'),'true');
  assert.equal((await snapshot()).covered,true);
 });
 await check('Tampered pack is rejected without changing the current selection',async()=>{
  const raw=JSON.parse(await readFile(receipt.packPath,'utf8'));raw.hands=[[2,4],[1,3]];
  const path=downloads+'/tampered.json';await writeFile(path,JSON.stringify(raw));await upload(path);
  await waitFor(async()=>/Could not open pack/.test(await b.evaluate('document.querySelector("[data-testid=pack-status]").textContent')),'invalid pack rejection');
  assert.equal(await b.evaluate('document.querySelector("[data-pack=shape-text]").getAttribute("aria-pressed")'),'true');
  assert.equal(await b.evaluate('document.querySelector("#table-title").textContent'),'Pocket Signals');
 });
 await check('Designer leak witness stays separate from live play and cannot activate',async()=>{
  await b.click('#workshop-tab');await b.click('[data-lab="reveal-opponent"]');
  const text=await b.evaluate('document.querySelector("#lab-result").textContent');
  assert.match(text,/information leak/);assert.match(text,/Synthetic state A/);assert.match(text,/Synthetic state B/);
  assert.equal(await b.evaluate('document.querySelector("#use-checked-pack")!==null'),false);
  assert.equal(await b.evaluate('document.querySelector("[data-testid=private-hand]")!==null'),false);
  receipt.screenshots.push(await b.screenshot('desktop-workshop.png'));
  await b.click('#play-tab');assert.equal((await snapshot()).covered,true);
  assert.equal(await b.evaluate('document.body.textContent.includes("Leaked opponent cards:")'),false);
 });
 await check('Proposal review is grounded, text-only, and invalidated by editing',async()=>{
  await b.click('#workshop-tab');await b.click('#load-example');await b.click('#validate-proposal');
  assert.equal(await b.evaluate('document.querySelectorAll(".proposal-preview blockquote").length'),2);
  assert.ok(await b.evaluate('document.querySelector(".proposal-preview button")!==null'));
  await b.evaluate('(()=>{const e=document.querySelector("#proposal-json");const p=JSON.parse(e.value);p.summary="<img src=x onerror=alert(1)>";e.value=JSON.stringify(p);e.dispatchEvent(new Event("input",{bubbles:true}));return true;})()');
  assert.equal(await b.evaluate('document.querySelector(".proposal-preview button")!==null'),false);
  await b.click('#validate-proposal');
  assert.equal(await b.evaluate('document.querySelector(".proposal-preview img")!==null'),false);
  assert.ok(await b.evaluate('document.querySelector(".proposal-preview").textContent.includes("<img src=x onerror=alert(1)>")'));
  await b.evaluate('(()=>{const e=document.querySelector("#proposal-json");const p=JSON.parse(e.value);p.changes[0].adapter="reveal-opponent";e.value=JSON.stringify(p);e.dispatchEvent(new Event("input",{bubbles:true}));return true;})()');
  await b.click('#validate-proposal');assert.match(await b.evaluate('document.querySelector(".proposal-preview").textContent'),/unsupported authoring adapter/);
  assert.equal(await b.evaluate('document.querySelector(".proposal-preview button")!==null'),false);
 });
 await check('Complete good workshop check activates only an approved pack',async()=>{
  await b.click('[data-lab="switch-select"]');assert.match(await b.evaluate('document.querySelector("#lab-result").textContent'),/450 states · 420 transitions · 30 initial states/);
  await b.click('#use-checked-pack');assert.equal((await snapshot()).covered,true);
  assert.equal(await b.evaluate('document.querySelector("[data-pack=switch-select]").getAttribute("aria-pressed")'),'true');
 });
 await check('Narrow layouts stay within viewport and retain usable controls',async()=>{
  for(const width of [390,320]){
   await b.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
   await mount({game:'beacon-steps'});
   assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),'overflow at '+width);
   const sizes=await b.evaluate('[...document.querySelectorAll("[data-choice]")].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');
   assert.ok(sizes.every(s=>s.width>=44&&s.height>=44));
   if(width===390){
    await b.evaluate('scrollTo(0,0);true');receipt.screenshots.push(await b.screenshot('mobile-overview.png'));
    await b.evaluate('document.querySelector(".table-panel").scrollIntoView({block:"start"});true');receipt.screenshots.push(await b.screenshot('mobile-table.png'));
   }
  }
  await mount({});await b.click('#reveal-hand');await b.click('[data-choice="0"]');assert.equal((await snapshot()).covered,true);
 });
 await check('No runtime exceptions or non-loopback page requests',async()=>{
  assert.deepEqual(b.errors,[]);
 });
 receipt.ok=true;
}catch(error){
 receipt.ok=false;receipt.failure={message:error.message,stack:error.stack};
 if(b)await b.screenshot('failure.png').catch(()=>{});
 throw error;
}finally{
 receipt.finishedAt=new Date().toISOString();receipt.browserErrors=b?.errors||[];
 await writeFile(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt));await b?.close();if(server)await new Promise(r=>server.close(r));
}
