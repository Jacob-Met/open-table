import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {createAppServer} from '../server.mjs';
import {createPack} from '../src/pack.js';
import {launchBrowser} from './browser-driver.mjs';

const output=resolve(process.env.OPEN_TABLE_CONTINUOUS_DIR||'receiving/continuous-qualified');
try{await access(output+'/receipt.json');throw new Error('Use a fresh continuous receiving directory.');}
catch(e){if(e.code!=='ENOENT')throw e;}
await mkdir(output,{recursive:true});
const externalURL=process.env.OPEN_TABLE_RECEIVING_URL;
const server=externalURL?null:createAppServer();
if(server)await new Promise(r=>server.listen(0,'127.0.0.1',r));
const receipt={schema:'open-table.continuous-receiving.v1',startedAt:new Date().toISOString(),
 sourceSha256:createHash('sha256').update(await readFile(new URL('../src/app.js',import.meta.url))).digest('hex'),
 checks:[],observations:[]};
let b;
const enter={key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'};
const space={key:' ',code:'Space',windowsVirtualKeyCode:32,text:' ',unmodifiedText:' '};
const key=(params,type,repeat=false)=>b.send('Input.dispatchKeyEvent',{...params,type,...(repeat?{autoRepeat:true}:{})});
const focus=selector=>b.evaluate('document.querySelector('+JSON.stringify(selector)+').focus();true');
async function state(){
 return b.evaluate("(()=>{\n const q=selector=>document.querySelector(selector),t=globalThis.__scanEvidence;\n return {position:q('.track')?.getAttribute('aria-label')||null,focus:document.activeElement.id,\n covered:!!q('#reveal-hand'),privateVisible:!!q('#private-title'),\n hand:[...document.querySelectorAll('.playing-card')].map(x=>x.getAttribute('aria-label')),\n choice:q('#confirm-choice')?.textContent||null,toggle:q('#toggle-scan')?.getAttribute('aria-pressed')||null,\n result:q('.end-result')?.textContent||null,rounds:q('.rounds')?.textContent||'',\n live:q('[data-testid=public-live]')?.textContent||'',\n timers:[...t.active.values()].map(x=>({delay:x.delay,ticks:x.ticks,ageMs:performance.now()-x.started})),\n maxTimers:t.max,starts:t.starts};\n})()");
}
async function check(name,run){await run();receipt.checks.push(name);receipt.observations.push({check:name,state:await state()});}
async function mount({game='beacon-steps',nearFinish=false}={}){
 await b.evaluate("(async()=>{\n const g=await import('/src/games.js'),a=await import('/src/app.js');\n const game=OPTIONS.game||'beacon-steps';\n let initial=game==='pocket-signals'?g.initialStates(game).find(s=>JSON.stringify(s.hands)==='[[2,4],[1,3]]'):g.initialStates(game)[0];\n if(OPTIONS.nearFinish)for(let n=0;n<3;n++)initial=g.step(initial,g.legalActions(initial,g.observe(initial,0).turn).find(x=>x.steps===2));\n a.mountApp(document.getElementById('app'),{gameId:game,initialState:initial});return true;\n})()".replaceAll('OPTIONS',JSON.stringify({game,nearFinish})));
 await b.click('[data-pack="switch-select"]');
}
async function expectTimer(count){const s=await state();assert.equal(s.timers.length,count);assert.ok(s.maxTimers<=1);}
async function speed(ms){
 await focus('#scan-speed');
 await b.key('Home');
 if(ms===2400)await b.key('ArrowDown');
 if(ms===4000){await b.key('ArrowDown');await b.key('ArrowDown');}
 assert.equal(await b.evaluate('Number(document.querySelector("#scan-speed").value)'),ms);
}
async function upload(path){
 const {root}=await b.send('DOM.getDocument');
 const {nodeId}=await b.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#pack-file'});
 await b.send('DOM.setFileInputFiles',{nodeId,files:[path]});
 const deadline=Date.now()+5000;
 while(Date.now()<deadline){if((await state()).covered)return;await delay(50);}
 throw new Error('Import did not cover the hand.');
}
try{
 b=await launchBrowser({url:externalURL||'http://127.0.0.1:'+server.address().port+'/',screenshotDir:output});
 await b.evaluate("(()=>{\n const set=globalThis.setInterval.bind(globalThis),clear=globalThis.clearInterval.bind(globalThis);\n const evidence={active:new Map(),max:0,starts:0};globalThis.__scanEvidence=evidence;\n globalThis.setInterval=(fn,delay,...args)=>{\n  const entry={delay,ticks:0,started:performance.now()};\n  const id=set(()=>{entry.ticks++;fn(...args);},delay);\n  evidence.active.set(id,entry);evidence.max=Math.max(evidence.max,evidence.active.size);evidence.starts++;return id;\n };\n globalThis.clearInterval=id=>{evidence.active.delete(id);clear(id);};return true;\n})()");
 await check('Start and successive Beacon confirmations each require a fresh Enter press',async()=>{
  await mount();await focus('#toggle-scan');
  await key(enter,'keyDown');let s=await state();assert.match(s.position,/marker at 0$/);assert.equal(s.focus,'confirm-choice');await expectTimer(1);
  await key(enter,'keyDown',true);s=await state();assert.match(s.position,/marker at 0$/);
  await key(enter,'keyUp');
  await key(enter,'keyDown');s=await state();assert.match(s.position,/marker at 1$/);assert.equal(s.focus,'confirm-choice');await expectTimer(1);
  await key(enter,'keyDown',true);assert.match((await state()).position,/marker at 1$/);await key(enter,'keyUp');
  await b.key('Enter');assert.match((await state()).position,/marker at 2$/);
  await delay(350);s=await state();assert.match(s.choice,/Advance 1/);assert.equal(s.timers[0].ticks,0);
  await delay(1150);s=await state();assert.match(s.choice,/Advance 2/);assert.match(s.position,/marker at 2$/);
  await b.screenshot('continuous-beacon.png');
 });
 await check('Pocket pauses under its curtain; Reveal resumes without committing on the held key',async()=>{
  await mount({game:'pocket-signals'});await b.click('#reveal-hand');await b.click('#toggle-scan');
  await key(enter,'keyDown');let s=await state();assert.equal(s.covered,true);assert.equal(s.privateVisible,false);assert.equal(s.focus,'reveal-hand');await expectTimer(0);
  await key(enter,'keyDown',true);await delay(2900);s=await state();assert.equal(s.covered,true);assert.deepEqual(s.hand,[]);assert.equal(s.rounds,'');await expectTimer(0);
  const names=(await b.axTree()).filter(n=>!n.ignored).map(n=>n.name?.value||'');
  assert.ok(!names.some(x=>/^Card [1-5],/.test(x)));assert.ok(!/Commit card/.test(s.live));
  await key(enter,'keyUp');await key(enter,'keyDown');
  s=await state();assert.deepEqual(s.hand,['Card 1, circle','Card 3, square']);assert.equal(s.focus,'confirm-choice');await expectTimer(1);
  await key(enter,'keyDown',true);assert.equal((await state()).rounds,'');
  await key(enter,'keyUp');await b.key('Enter');
  s=await state();assert.equal(s.covered,true);assert.match(s.rounds,/P1 played 2 · P2 played 1/);await expectTimer(0);
 });
 await check('Pause persists across speed changes, private turns and a harmless rerender',async()=>{
  await mount({game:'pocket-signals'});await b.click('#reveal-hand');await b.click('#toggle-scan');await b.click('#toggle-scan');
  await speed(1400);await delay(2900);let s=await state();assert.match(s.choice,/Commit 2$/);assert.equal(s.toggle,'false');await expectTimer(0);
  await b.click('#next-choice');await focus('#confirm-choice');await b.key('Enter');await b.key('Enter');
  s=await state();assert.equal(s.privateVisible,true);assert.equal(s.toggle,'false');await expectTimer(0);
  await b.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:output+'/downloads'});
  await mkdir(output+'/downloads',{recursive:true});await b.click('#save-pack');await expectTimer(0);
  assert.equal((await state()).toggle,'false');await b.click('#toggle-scan');await expectTimer(1);
 });
 await check('Workshop, mode changes and pack reopen cancel scanning and cover private choices',async()=>{
  await mount({game:'pocket-signals'});await b.click('#reveal-hand');await b.click('#toggle-scan');
  await b.click('#workshop-tab');await expectTimer(0);assert.equal((await state()).privateVisible,false);
  await b.click('#play-tab');assert.equal((await state()).covered,true);await b.click('#reveal-hand');await expectTimer(0);
  assert.equal((await state()).toggle,'false');
  await b.click('#toggle-scan');await b.click('[data-pack="shape-text"]');await expectTimer(0);assert.equal((await state()).covered,true);
  await b.click('[data-pack="switch-select"]');await b.click('#reveal-hand');await expectTimer(0);
  await b.click('#toggle-scan');
  const pack=createPack('pocket-signals','switch-select'),path=output+'/reopen.json';
  await writeFile(path,typeof pack==='string'?pack:JSON.stringify(pack));await upload(path);
  await expectTimer(0);assert.equal((await state()).covered,true);await b.click('#reveal-hand');await expectTimer(0);
  assert.equal((await state()).toggle,'false');await delay(1500);assert.equal((await state()).rounds,'');
 });
 await check('Speed replaces one timer; finish and Space activation preserve deliberate boundaries',async()=>{
  await mount({nearFinish:true});await b.click('#toggle-scan');await speed(2400);await expectTimer(1);assert.equal((await state()).timers[0].delay,2400);
  await focus('#confirm-choice');await key(enter,'keyDown');let s=await state();assert.match(s.position,/marker at 7$/);assert.equal(s.focus,'new-game');await expectTimer(0);
  await key(enter,'keyDown',true);assert.ok((await state()).result);await delay(1500);await expectTimer(0);
  await key(enter,'keyUp');await b.key('Enter');s=await state();assert.match(s.position,/marker at 0$/);assert.equal(s.focus,'confirm-choice');await expectTimer(1);
  await key(space,'keyDown');await key(space,'keyDown',true);assert.match((await state()).position,/marker at 0$/);
  await key(space,'keyUp');s=await state();assert.match(s.position,/marker at 1$/);
  await b.key('Space');assert.match((await state()).position,/marker at 2$/);
  await b.click('#toggle-scan');await expectTimer(0);
 });
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
