import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),arg=n=>args.includes(n)?args[args.indexOf(n)+1]:undefined;
if(process.getuid?.()===0)throw new Error('Receiver must run as non-root');
const source=resolve(arg('--source')||args[0]),output=resolve(arg('--output')||args[1]);
const fileArg=arg('--file');if(fileArg&&!fileArg.startsWith('/'))throw new Error('--file must be absolute');
const artifact=fileArg?resolve(fileArg):null,receivingURL=arg('--url');
if(artifact&&receivingURL)throw new Error('--file and --url are mutually exclusive');
await mkdir(output);
const {createAppServer}=await import(pathToFileURL(join(source,'server.mjs')));
const {launchBrowser}=await import(pathToFileURL(join(source,'scripts/browser-driver.mjs')));
const report={schema:'open-table.workshop-reselect-receipt.v1',source,artifact,offline:Boolean(artifact),startedAt:new Date().toISOString(),hashes:{},checks:[],errors:[],requests:[]};
for(const name of ['src/app.js','server.mjs','scripts/browser-driver.mjs'])report.hashes[name]=createHash('sha256').update(await readFile(join(source,name))).digest('hex');
if(artifact)report.artifactHash=createHash('sha256').update(await readFile(artifact)).digest('hex');
const server=artifact||receivingURL?null:createAppServer();let browser;
function check(name,value,detail){report.checks.push({name,pass:Boolean(value),detail});}
try{
 if(server)await new Promise((r,j)=>{server.once('error',j);server.listen(0,'127.0.0.1',r);});
 browser=await launchBrowser(artifact?{filePath:artifact,artifactRoot:dirname(artifact),offline:true,screenshotDir:output}:{url:receivingURL||'http://127.0.0.1:'+server.address().port+'/',screenshotDir:output});
 report.browserVersion=await browser.send('Browser.getVersion');
 const text=s=>browser.evaluate(`document.querySelector(${JSON.stringify(s)})?.textContent??null`);
 const value=()=>browser.evaluate('document.querySelector("#proposal-json")?.value??null');
 const exists=s=>browser.evaluate(`Boolean(document.querySelector(${JSON.stringify(s)}))`);
 const click=s=>browser.click(s);
 async function draft(t){await click('#proposal-json');await browser.send('Input.insertText',{text:t});}
 async function keyboardPicker(id){
  // Reach the actual rendered control through keyboard traversal, without a synthetic click.
  let reached=false;
  for(let i=0;i<60;i++){
   if(await browser.evaluate(`document.activeElement?.getAttribute('data-game')===${JSON.stringify(id)}`)){reached=true;break;}
   await browser.key('Tab');
  }
  if(!reached)throw new Error('Could not reach picker by Tab: '+id);
  await browser.key('Enter');
 }
 await click('[data-choice]:first-child');
 const progressed=await text('[data-testid="board"]');
 check('Beacon progressed through real choice',progressed?.includes('Player 2 to move'),progressed);
 await click('#workshop-tab');
 const beaconDraft='{"summary":"unfinished Beacon receiving 9f75';await draft(beaconDraft);
 await click('[data-lab="drop-action"]');const beaconLab=await text('[data-testid="lab-result"]');
 check('Beacon negative lab established',beaconLab?.includes('breaks the promise'),beaconLab);
 await keyboardPicker('beacon-steps');
 check('Keyboard reselect preserves incomplete Beacon draft',await value()===beaconDraft,await value());
 check('Keyboard reselect preserves Beacon lab',await text('[data-testid="lab-result"]')===beaconLab);
 await browser.screenshot('beacon-workshop-reselect.png');
 await click('#play-tab');check('Beacon progress survives Workshop reselect',await text('[data-testid="board"]')===progressed);
 await click('[data-game="beacon-steps"]');
 check('AtTable same-game selection deliberately resets Beacon',await text('[data-testid="board"]')!==progressed && (await text('[data-testid="board"]')).includes('Player 1 to move'));
 await click('[data-game="pocket-signals"]');await click('#reveal-hand');await click('[data-choice]:first-child');
 const pocketProgress=await text('[data-testid="board"]');
 check('Pocket P1 real commit reached P2 handoff',pocketProgress?.includes('Over to Player 2')&&!await exists('[data-testid="private-hand"]'),pocketProgress);
 await click('#workshop-tab');const pocketDraft='{"summary":"unfinished Pocket receiving 9f75';await draft(pocketDraft);
 await click('[data-lab="reveal-opponent"]');const pocketLab=await text('[data-testid="lab-result"]');
 check('Pocket synthetic leakage rejection established',pocketLab?.includes('Leaked opponent cards')&&pocketLab?.includes('breaks the promise'));
 await click('[data-game="pocket-signals"]');
 check('Pointer reselect preserves incomplete Pocket draft',await value()===pocketDraft,await value());
 check('Pointer reselect preserves Pocket lab',await text('[data-testid="lab-result"]')===pocketLab);
 check('Workshop never renders real private hand',!await exists('[data-testid="private-hand"]'));
 await browser.screenshot('pocket-workshop-reselect.png');
 await click('#play-tab');check('Pocket committed turn survives reselect and remains covered',await text('[data-testid="board"]')===pocketProgress&&!await exists('[data-testid="private-hand"]'));
 // Continue the preserved real game: a second commit must finish round one.
 await click('#reveal-hand');await click('[data-choice]:first-child');
 check('Pocket second commit reveals completed first round',(await text('[data-testid="board"]'))?.includes('Round 1: P1 played'));
 await click('#workshop-tab');await draft('cross-game draft');await click('[data-lab="shape-text"]');await click('[data-game="beacon-steps"]');
 check('Different Workshop game still clears incompatible draft',await value()==='');
 check('Different Workshop game still clears lab',!await exists('[data-testid="lab-result"]'));
 await click('#play-tab');check('Different game begins fresh Beacon', (await text('[data-testid="board"]'))?.includes('Player 1 to move'));
}catch(error){report.failure=error.stack;}
finally{
 if(browser){report.errors=[...browser.errors];report.requests=[...browser.requests];try{await browser.close();}catch(e){report.cleanupError=e.message;}}
 if(server)await new Promise(r=>server.close(r));
 report.finalHashes={};for(const [name,hash] of Object.entries(report.hashes)){const now=createHash('sha256').update(await readFile(join(source,name))).digest('hex');report.finalHashes[name]=now;check('Source unchanged: '+name,hash===now);}
 if(artifact){report.finalArtifactHash=createHash('sha256').update(await readFile(artifact)).digest('hex');check('Offline artifact unchanged',report.finalArtifactHash===report.artifactHash);}
 const permitted=url=>{if(/^(data:|blob:|about:)/.test(url))return true;try{const u=new URL(url);if(artifact){u.hash='';return u.href===pathToFileURL(artifact).href;}return ['http:','https:','ws:','wss:'].includes(u.protocol)&&['127.0.0.1','localhost','[::1]'].includes(u.hostname);}catch{return false;}};
 check('All observed requests stay within receiving boundary',report.requests.every(r=>r.kind!=='blocked'&&permitted(r.url)),report.requests.filter(r=>r.kind==='blocked'||!permitted(r.url)));
 report.finishedAt=new Date().toISOString();report.pass=!report.failure&&!report.cleanupError&&report.errors.length===0&&report.checks.length>0&&report.checks.every(x=>x.pass);
 await writeFile(join(output,'receipt.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));if(!report.pass)process.exitCode=1;
}
