import {launchBrowser} from './browser-driver.mjs';
import {createAppServer} from '../server.mjs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const args=process.argv.slice(2),q=JSON.stringify,SLOT='open-table.saved-match.v1',BOARD='[data-testid="board"]';
function arg(name){const i=args.indexOf(name);if(i<0)return null;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Missing '+name+' value');return args[i+1];}
const file=arg('--file')&&resolve(arg('--file')),externalUrl=arg('--url'),out=resolve(arg('--output')||'receiving/saved-match-'+randomUUID());
if(file&&externalUrl)throw Error('Choose --file or --url');
await mkdir(out,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const receipt={schema:'open-table.saved-match-receiving.v1',startedAt:new Date().toISOString(),mode:file?'standalone-offline':externalUrl?'package-http':'source-http',checks:[],screenshots:[],limitations:['Fresh Chrome profile; no cross-browser durability claim.','Observed storage checks do not provide an atomic multi-tab lock.']};
let server,b;
async function waitFor(expression){
 const deadline=Date.now()+10000;
 while(Date.now()<deadline){try{if(await b.evaluate(expression))return;}catch{}await new Promise(r=>setTimeout(r,75));}
 throw Error('Application readiness timed out');
}
async function check(name,expression){const ok=!!await b.evaluate(expression);receipt.checks.push({name,ok});if(!ok)throw Error(name);}
async function confirm(selector){
 await b.click(selector);await check('Confirmation opens '+selector,"!!document.querySelector('#match-confirmation')");
 await check('Cancel initially focused '+selector,"document.activeElement?.id==='match-cancel'");await b.click('#match-confirm');
}
async function reload(){
 await b.evaluate('window.__savedMatchReceiveBeforeReload=true');await b.send('Page.reload');
 await waitFor("!window.__savedMatchReceiveBeforeReload&&document.readyState==='complete'&&!!document.querySelector('#saved-match-panel')&&!!document.querySelector('#table-title')");
}
const slot=()=>b.evaluate('localStorage.getItem('+q(SLOT)+')');
const board=()=>b.evaluate('document.querySelector('+q(BOARD)+')?.textContent');
async function neutral(){
 await check('Covered handoff contains no private choices',"!!document.querySelector('[data-testid=handoff]')&&!!document.querySelector('#reveal-hand')&&!document.querySelector('#private-title')&&!document.querySelector('[data-choice]')&&!document.querySelector('[data-testid=private-hand]')");
 const nodes=await b.axTree(),safe=!nodes.some(n=>!n.ignored&&/^Card [1-5],/.test(n.name?.value||''));
 receipt.checks.push({name:'Covered accessibility tree contains no named private cards',ok:safe});if(!safe)throw Error('Private card names exposed');
}
try{
 let config={screenshotDir:out,width:1280,height:980};
 if(file){config={...config,filePath:file,artifactRoot:dirname(file),offline:true,hash:''};receipt.artifactSha256=hash(await readFile(file));}
 else if(externalUrl){config.url=externalUrl;receipt.url=externalUrl;}
 else{server=createAppServer();await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});config.url='http://127.0.0.1:'+server.address().port+'/';}
 b=await launchBrowser(config);receipt.browser=await b.send('Browser.getVersion');
 await waitFor("!!document.querySelector('#saved-match-panel')");
 await b.evaluate("localStorage.setItem('saved-match-receiving-unrelated','keep');true");
 await b.click('[data-choice="0"]');await b.click('[data-choice="1"]');
 const beaconBoard=await board();if(!beaconBoard)throw Error('Missing public board oracle');
 await check('Beacon progressed to space three',"/marker at 3$/.test(document.querySelector('.track').getAttribute('aria-label'))");
 await confirm('#save-match');const beaconSave=await slot();if(!beaconSave)throw Error('Missing persisted Beacon save');
 receipt.beaconSaveSha256=hash(beaconSave);
 await reload();await confirm('#resume-match');
 await check('Progressed Beacon public board restores','document.querySelector('+q(BOARD)+').textContent==='+q(beaconBoard));
 await b.evaluate("document.querySelector('#table-title').scrollIntoView({block:'start'});true");receipt.screenshots.push(await b.screenshot('beacon-restored.png'));
 await b.click('[data-game="pocket-signals"]');
 await check('New game preserves explicit saved slot','localStorage.getItem('+q(SLOT)+')==='+q(beaconSave));
 await b.click('#reveal-hand');await check('Explicit P1 reveal works',"!!document.querySelector('[data-testid=private-hand]')");
 await b.click('[data-choice="0"]');await check('P2 owns next turn',"document.querySelector('.player-tag').textContent.trim()==='Player 2 to move'");await neutral();
 const pocketBoard=await board();await confirm('#save-match');const pocketSave=await slot();if(!pocketSave)throw Error('Missing persisted Pocket save');
 receipt.pocketSaveSha256=hash(pocketSave);await reload();await confirm('#resume-match');
 await check('Pocket public progression restores','document.querySelector('+q(BOARD)+').textContent==='+q(pocketBoard));await neutral();
 await check('Resume returns to Player 2',"document.querySelector('.player-tag').textContent.trim()==='Player 2 to move'");
 await b.evaluate("document.querySelector('#table-title').scrollIntoView({block:'start'});true");receipt.screenshots.push(await b.screenshot('pocket-resume-neutral.png'));
 await b.click('#reveal-hand');await check('Explicit P2 reveal offers playable cards',"!!document.querySelector('.playing-card[aria-label^=\"Card \"]')&&!!document.querySelector('[data-choice]')");
 await b.click('#forget-match');await b.click('#match-cancel');
 await check('Cancel forget preserves snapshot','localStorage.getItem('+q(SLOT)+')==='+q(pocketSave));await neutral();
 // Complete both rounds through ordinary controls, preserving the explicit snapshot.
 await b.click('#reveal-hand');await b.click('[data-choice="0"]');
 for(let turn=0;turn<2;turn++){await b.click('#reveal-hand');await b.click('[data-choice="0"]');}
 await check('Pocket reaches a visible completed game',"!!document.querySelector('#new-game')&&!document.querySelector('#reveal-hand')");
 const finished=await board();await confirm('#save-match');await b.click('#new-game');await confirm('#resume-match');
 await check('Completed game restores result and public rounds','!!document.querySelector("#new-game")&&document.querySelector('+q(BOARD)+').textContent==='+q(finished));
 await confirm('#forget-match');await check('Confirmed forget removes only its own slot','localStorage.getItem('+q(SLOT)+')===null&&localStorage.getItem("saved-match-receiving-unrelated")==="keep"');
 await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});
 await b.evaluate("document.querySelector('#saved-match-panel').scrollIntoView({block:'center'});true");
 await check('Saved-match controls fit narrow viewport',"document.documentElement.scrollWidth<=innerWidth");
 receipt.screenshots.push(await b.screenshot('saved-match-320.png'));
 receipt.errors=b.errors;receipt.forbiddenRequests=b.requests.filter(r=>r.kind==='blocked');
 receipt.ok=receipt.errors.length===0&&receipt.forbiddenRequests.length===0;if(!receipt.ok)throw Error('Browser errors or forbidden requests reported');
}catch(error){receipt.ok=false;receipt.failure=String(error.stack||error);process.exitCode=1;if(b)await b.screenshot('failure.png').catch(()=>{});}
finally{
 if(b){receipt.errors=b.errors;try{await b.close();receipt.browserClosed=true;}catch(error){receipt.cleanupError=String(error);receipt.ok=false;process.exitCode=1;}}
 if(server)await new Promise(r=>server.close(r));
 receipt.finishedAt=new Date().toISOString();await writeFile(resolve(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:receipt.ok,checks:receipt.checks.length,receipt:resolve(out,'receipt.json'),failure:receipt.failure}));
}
