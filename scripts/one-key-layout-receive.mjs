// scripts/one-key-layout-receive.mjs
// Seven bounded checks using the maintained native Chrome driver.
// The only deliberate DOM mutation is the labelled 2x CSS zoom fixture.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {launchBrowser} from './browser-driver.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function parse(argv){
 const flags={};
 for(let i=0;i<argv.length;i+=2){
  const flag=argv[i];
  assert(['--output','--url','--file'].includes(flag)&&argv[i+1],
   'Usage: --output NEW_DIR [--url LOOPBACK_URL | --file ABSOLUTE_HTML]');
  assert(!(flag in flags),'Repeated option: '+flag);
  flags[flag]=argv[i+1];
 }
 assert(flags['--output'],'--output required');
 assert(!(flags['--url']&&flags['--file']),'Choose --url or --file');
 if(flags['--file'])assert(path.isAbsolute(flags['--file']),'--file must be absolute');
 if(flags['--url']){
  const u=new URL(flags['--url']);
  assert(['http:','https:'].includes(u.protocol));
  assert(['localhost','127.0.0.1','[::1]'].includes(u.hostname));
  assert(!u.username&&!u.password,'Credentials not accepted');
 }
 return {
  output:path.resolve(flags['--output']),
  file:flags['--file']||null,
  url:flags['--url']||null
 };
}

const options=parse(process.argv.slice(2));
await mkdir(options.output);

const receipt={
 format:'open-table.one-key-layout-receiving.v1',
 startedAt:new Date().toISOString(),
 status:'running',
 checks:[],
 observations:{},
 screenshots:[],
 fixture:{
  normalViewport:{width:320,height:844},
  desktopViewport:{width:1280,height:980},
  enlargedView:'Explicit 2x CSS zoom reflow fixture at 320x844; not physical switch, OS magnification, or native browser zoom qualification'
 }
};

let browser,server,originalHTML,zoomApplied=false;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ev=expression=>browser.evaluate(expression);

async function wait(expression,label,timeout=30000){
 const until=Date.now()+timeout;
 let last;
 while(Date.now()<until){
  last=await ev(expression);
  if(last)return last;
  await delay(60);
 }
 throw new Error('Timed out: '+label+'; last='+JSON.stringify(last));
}

const visible=selector=>wait(
 'Boolean(document.querySelector('+JSON.stringify(selector)+')?.getClientRects().length)',
 'visible '+selector
);

const focused=selector=>wait(
 '(()=>{const n=document.querySelector('+JSON.stringify(selector)+');return Boolean(n&&document.activeElement===n);})()',
 'native focus '+selector,
 65000
);

async function activate(selector){
 await focused(selector);
 await browser.key('Enter');
}

async function shot(name){
 await browser.screenshot(name);
 receipt.screenshots.push(name);
}

async function check(name,operation){
 const started=Date.now();
 const record={name,startedAt:new Date().toISOString()};
 try{
  await operation();
  record.status='passed';
 }catch(error){
  record.status='failed';
  record.error=error.message;
  throw error;
 }finally{
  record.finishedAt=new Date().toISOString();
  record.durationMs=Date.now()-started;
  receipt.checks.push(record);
 }
}

// This function is serialized and evaluated in the browser. It reads public
// DOM state only; it does not invoke application functions or change focus.
function publicSnapshot(){
 const shown=n=>Boolean(n&&n.getClientRects().length);
 const setup=shown(document.querySelector('#one-key-setup-title'));
 let primary;
 if(setup){
  primary=[...document.querySelectorAll('[data-game]')];
 }else if(shown(document.querySelector('#new-game'))){
  primary=[document.querySelector('#new-game')];
 }else if(shown(document.querySelector('#reveal-hand'))){
  primary=[document.querySelector('#reveal-hand')];
 }else{
  primary=[
   ...document.querySelectorAll('button[data-choice]'),
   document.querySelector('#cover-hand')
  ].filter(Boolean);
 }
 const controls=[
  'one-key-pause','one-key-pace','one-key-menu','match-menu','one-key-exit'
 ].map(id=>document.getElementById(id)).filter(Boolean);
 const nodes=[...primary,...controls].filter(shown);

 const identity=n=>n.id||(
  n.hasAttribute('data-choice')?'choice:'+n.getAttribute('data-choice'):
  n.hasAttribute('data-game')?'game:'+n.getAttribute('data-game'):null
 );

 const rect=n=>{
  const r=n.getBoundingClientRect();
  return {
   left:r.left,top:r.top,right:r.right,bottom:r.bottom,
   width:r.width,height:r.height
  };
 };

 const hand=document.querySelector('[data-testid="private-hand"]');

 return {
  url:location.href,
  readyState:document.readyState,
  cssZoom:getComputedStyle(document.documentElement).zoom,
  hasFocus:document.hasFocus(),
  viewport:{
   width:document.documentElement.clientWidth,
   height:document.documentElement.clientHeight
  },
  windowViewport:{width:innerWidth,height:innerHeight},
  scroll:{x:scrollX,y:scrollY},
  documentWidth:document.documentElement.scrollWidth,
  bodyWidth:document.body.scrollWidth,
  active:document.activeElement?identity(document.activeElement):null,
  targets:nodes.map(n=>({
   id:identity(n),
   rect:rect(n),
   focused:document.activeElement===n,
   scrollWidth:n.scrollWidth,
   clientWidth:n.clientWidth
  })),
  handVisible:shown(hand),
  handText:shown(hand)?hand.innerText:null,
  revealVisible:shown(document.querySelector('#reveal-hand')),
  choices:[...document.querySelectorAll('button[data-choice]')]
   .filter(shown)
   .map(n=>({id:n.getAttribute('data-choice'),text:n.innerText})),
  terminal:shown(document.querySelector('#new-game'))&&
   shown(document.querySelector('.end-result')),
  pauseText:document.querySelector('#one-key-pause')?.innerText||null
 };
}

const snapshotExpression='('+publicSnapshot.toString()+')()';
const layout=()=>ev(snapshotExpression);

function noOverflow(s){
 assert(s.hasFocus,'Receiving document must retain actual focus');
 assert(
  s.viewport.width>0&&s.viewport.height>0,
  'Usable viewport must be positive'
 );
 assert(
  Math.max(s.documentWidth,s.bodyWidth)<=s.viewport.width+1,
  'Horizontal page overflow: '+JSON.stringify({
   viewport:s.viewport,
   documentWidth:s.documentWidth,
   bodyWidth:s.bodyWidth
  })
 );
 for(const t of s.targets){
  assert(
   t.scrollWidth<=t.clientWidth+1,
   'Button text/content overflow: '+t.id+' '+t.scrollWidth+' > '+t.clientWidth
  );
 }
}

function inside(r,v){
 return r.width>0&&r.height>0&&
  r.left>=-1&&r.top>=-1&&
  r.right<=v.width+1&&r.bottom<=v.height+1;
}

function allVisible(s){
 noOverflow(s);
 const ids=s.targets.map(t=>t.id);
 assert(ids.length&&ids.every(Boolean));
 assert.equal(new Set(ids).size,ids.length,'Duplicate target');

 for(const t of s.targets){
  assert(
   inside(t.rect,s.viewport),
   'Target outside usable viewport: '+t.id+' '+JSON.stringify(t.rect)
  );
 }

 for(let i=0;i<s.targets.length;i++){
  for(let j=i+1;j<s.targets.length;j++){
   const a=s.targets[i],b=s.targets[j];
   const x=Math.min(a.rect.right,b.rect.right)-
    Math.max(a.rect.left,b.rect.left);
   const y=Math.min(a.rect.bottom,b.rect.bottom)-
    Math.max(a.rect.top,b.rect.top);
   assert(x<=0.5||y<=0.5,'Controls overlap: '+a.id+' and '+b.id);
  }
 }
}

async function covered(){
 await visible('#reveal-hand');
 const s=await layout();
 assert(!s.handVisible,'Hand must be covered');
 return s;
}

async function cycle(enlarged=false){
 await focused('button[data-choice]');
 const initial=await layout();
 assert(initial.handVisible);
 assert.equal(initial.choices.length,2);
 assert.equal(initial.targets.length,8);

 const expected=[
  ...initial.choices.map(c=>'choice:'+c.id),
  'cover-hand',
  'one-key-pause',
  'one-key-pace',
  'one-key-menu',
  'match-menu',
  'one-key-exit'
 ];

 assert.deepEqual(initial.targets.map(t=>t.id),expected);
 assert.equal(initial.active,expected[0]);

 const sequence=[initial.active],samples=[];
 let last=initial.active,minY=Infinity,maxY=-Infinity,polls=0;
 const until=Date.now()+65000;

 while(Date.now()<until){
  const s=await layout();
  polls++;

  assert.deepEqual(s.choices,initial.choices);
  assert.equal(s.handText,initial.handText);
  assert(s.handVisible&&!s.revealVisible&&!s.terminal);
  assert.deepEqual(s.targets.map(t=>t.id),expected);
  noOverflow(s);

  if(enlarged){
   assert.equal(Number(s.cssZoom),2,'The explicit 2x CSS zoom fixture must remain applied');
   const active=s.targets.find(t=>t.id===s.active);
   assert(active,'Focus outside admitted targets');
   assert(
    inside(active.rect,s.viewport),
    'Enlarged focused target unreachable: '+active.id+' '+
     JSON.stringify(active.rect)
   );
  }else{
   allVisible(s);
  }

  minY=Math.min(minY,s.scroll.y);
  maxY=Math.max(maxY,s.scroll.y);

  const changed=s.active!==last;
  if(!samples.length||changed){
   samples.push({scroll:s.scroll,active:s.active,targets:s.targets});
  }
  if(changed){
   assert(expected.includes(s.active));
   sequence.push(s.active);
   last=s.active;
  }

  if(sequence.length===expected.length+1){
   assert.deepEqual(sequence,[...expected,expected[0]]);
   const range=maxY-minY;
   if(!enlarged){
    assert.equal(range,0,'Compact scan must have zero scroll range');
   }
   return {
    expectedTargets:expected,
    sequence,
    scrollRange:range,
    minScrollY:minY,
    maxScrollY:maxY,
    polls,
    samples
   };
  }

  await delay(60);
 }

 throw new Error(
  'Incomplete eight-target wraparound: '+JSON.stringify(sequence)
 );
}

async function enterSetup(){
 const target=new URL(browser.entryURL);
 target.hash='one-key';
 await browser.send('Page.navigate',{url:target.href});
 await wait(
  'location.href==='+JSON.stringify(target.href)+
   '&&document.readyState==="complete"',
  'committed One-key document'
 );
 await browser.send('Page.bringToFront',{});
 await wait('document.hasFocus()','foreground document');
 await visible('#one-key-setup-title');
}

function inventoryGate(){
 assert.deepEqual(browser.errors,[],'Browser errors');

 const origin=options.file?null:new URL(browser.entryURL).origin;
 const file=options.file?pathToFileURL(options.file).href:null;

 for(const request of browser.requests){
  const url=typeof request==='string'?request:request.url;
  assert.equal(
   typeof url,'string','Unknown driver request inventory shape'
  );

  if(
   url==='about:blank'||
   url.startsWith('data:')||
   url.startsWith('blob:')
  ){
   continue;
  }

  const parsed=new URL(url);
  parsed.hash='';

  if(options.file){
   assert.equal(parsed.href,file,'Unexpected file dependency: '+url);
  }else{
   assert.equal(parsed.origin,origin,'External dependency: '+url);
  }
 }
}

try{
 // Fail before launching a browser. Retain the failure in the fresh receipt.
 assert(
  typeof process.getuid==='function'&&process.getuid()!==0,
  'Run the receiver as a non-root user before launching Chrome'
 );
 receipt.receiverUid=process.getuid();

 const local={};
 for(const name of ['src/app.js','styles.css','src/one-key.js']){
  const bytes=await readFile(path.join(root,name));
  local[name]={bytes:bytes.length,sha256:sha(bytes)};
 }

 if(options.file){
  originalHTML=await readFile(options.file);
  browser=await launchBrowser({
   filePath:options.file,
   artifactRoot:path.dirname(options.file),
   hash:'one-key',
   offline:true,
   width:320,
   height:844,
   screenshotDir:options.output
  });
 }else{
  let url=options.url;

  if(!url){
   const {createAppServer}=await import('../server.mjs');
   server=createAppServer();
   await new Promise((accept,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',accept);
   });
   url='http://127.0.0.1:'+server.address().port+'/';
  }

  const entry=new URL(url);
  entry.hash='one-key';
  browser=await launchBrowser({
   url:entry.href,
   width:320,
   height:844,
   screenshotDir:options.output
  });
 }

 receipt.entryURL=browser.entryURL;
 receipt.browserPid=browser.pid;

 const status=await readFile('/proc/'+browser.pid+'/status','utf8');
 const uid=status.match(/^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/m);
 assert(uid,'Cannot verify browser UID');
 const uids=uid.slice(1).map(Number);
 assert(uids.every(n=>n!==0),'Browser must not run as root');
 receipt.browserUids=uids;

 await wait('document.readyState==="complete"','document complete');
 await browser.send('Page.bringToFront',{});
 await wait('document.hasFocus()','foreground after launch');

 await check('source-or-standalone-artifact-binding',async()=>{
  receipt.localInputs=local;

  if(options.file){
   const embedded=await ev(
    '(()=>{const n=document.getElementById("open-table-offline-build");'+
    'return n?JSON.parse(n.textContent):null;})()'
   );
   assert.equal(embedded?.format,'open-table.offline-build.v1');

   for(const [name,expected] of Object.entries(embedded.inputs)){
    assert(
     !path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..')
    );
    const bytes=await readFile(path.join(root,name));
    assert.equal(bytes.length,expected.bytes,'Input size: '+name);
    assert.equal(sha(bytes),expected.sha256,'Input hash: '+name);
   }

   for(const [name,expected] of Object.entries(local)){
    assert.deepEqual(embedded.inputs[name],expected);
   }

   const pins=await import(
    pathToFileURL(path.join(root,'src/ruleset-pins.js')).href
   );
   assert.deepEqual(embedded.sourceBinding.pins,pins.RULESET_PINS);
   assert.deepEqual(
    embedded.sourceBinding.sourceDigests,
    pins.RULESET_SOURCE_DIGESTS
   );

   receipt.artifact={
    file:path.basename(options.file),
    bytes:originalHTML.length,
    sha256:sha(originalHTML),
    inputCount:Object.keys(embedded.inputs).length
   };
  }else{
   for(const [name,expected] of Object.entries(local)){
    const response=await fetch(
     new URL('/'+name,browser.entryURL),
     {redirect:'error'}
    );
    assert(response.ok,'Source fetch failed: '+name);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length,expected.bytes);
    assert.equal(sha(bytes),expected.sha256,'Served source: '+name);
   }
  }
 });

 await check('320-setup-and-private-curtain-targets-visible',async()=>{
  await visible('#one-key-setup-title');
  await focused('[data-game="beacon-steps"]');

  const setup=await layout();
  assert.equal(setup.targets.length,6);
  allVisible(setup);
  const headings=(await browser.axTree()).filter(n=>!n.ignored&&n.role?.value==='heading').map(n=>({name:n.name?.value,level:n.properties?.find(p=>p.name==='level')?.value?.value}));
  assert(headings.some(h=>h.name==='One-key play'&&h.level===1),'Accessible One-key page heading');
  receipt.observations.headings=headings;
  receipt.observations.setup=setup;
  await shot('320-setup.png');

  await activate('[data-game="pocket-signals"]');
  const curtain=await covered();
  assert.equal(curtain.targets.length,6);
  allVisible(curtain);
  receipt.observations.curtain=curtain;
  await shot('320-private-curtain.png');
 });

 await check(
  '320-eight-target-cycle-zero-scroll-and-stable-private-view',
  async()=>{
   await activate('#reveal-hand');
   await visible('[data-testid="private-hand"]');
   receipt.observations.compactCycle=await cycle(false);
   await shot('320-private-choices.png');
  }
 );

 await check(
  'pause-covers-resume-pinned-and-fresh-private-gate',
  async()=>{
   await activate('#one-key-pause');
   await covered();
   await focused('#one-key-pause');

   const samples=[];
   let polls=0;
   const until=Date.now()+3100;

   while(Date.now()<until){
    const s=await layout();
    polls++;
    assert.equal(s.active,'one-key-pause');
    assert.match(s.pauseText,/resume/i);
    assert(!s.handVisible&&s.revealVisible);
    allVisible(s);
    if(!samples.length)samples.push(s);
    await delay(80);
   }

   samples.push(await layout());
   receipt.observations.paused={polls,samples};
   await shot('320-paused-resume.png');

   await browser.key('Enter');
   await covered();
   await focused('#reveal-hand');
   const resumed=await layout();
   assert.doesNotMatch(resumed.pauseText,/resume/i);
   receipt.observations.resumed=resumed;
  }
 );

 await check('320-beacon-terminal-and-replay-layout',async()=>{
  await activate('#one-key-menu');
  await visible('#one-key-setup-title');
  await activate('[data-game="beacon-steps"]');

  let turns=0;
  while(!(await layout()).terminal&&turns<7){
   await focused('button[data-choice]');
   allVisible(await layout());
   await browser.key('Enter');
   turns++;
  }

  await visible('#new-game');
  await visible('.end-result');
  assert(await ev(
   'Array.from(document.querySelectorAll("[aria-label]")).some('+
   'n=>/marker at 7$/i.test(n.getAttribute("aria-label")||""))'
  ));

  const terminal=await layout();
  allVisible(terminal);
  receipt.observations.beaconTerminal={turns,layout:terminal};
  await shot('320-beacon-terminal.png');

  await activate('#new-game');
  await focused('button[data-choice]');
  const replay=await layout();
  assert(!replay.terminal);
  allVisible(replay);
  receipt.observations.beaconReplay=replay;
  await shot('320-beacon-replay.png');
 });

 await check(
  'desktop-and-exit-preserve-ordinary-presentation',
  async()=>{
   await browser.send('Emulation.setDeviceMetricsOverride',{
    width:1280,height:980,deviceScaleFactor:1,mobile:false
   });
   await focused('button[data-choice]');
   allVisible(await layout());
   await shot('desktop-one-key.png');

   await activate('#one-key-exit');
   await visible('.hero');
   await visible('[data-testid="choice-comparison"]');
   await visible('.rules-panel');

   const ordinary=await ev(
    '({'+
    'compactShell:Boolean(document.querySelector(".one-key-shell")),'+
    'originalChoices:Boolean(document.querySelector(\'[aria-label="Original choices"]\')),'+
    'adaptedChoices:Boolean(document.querySelector(\'[aria-label="Adapted choices"]\')),'+
    'ruleItems:document.querySelectorAll(".rules-panel ol li").length,'+
    'rulesHeading:document.querySelector(".rules-panel h3")?.textContent,'+
    'heroText:document.querySelector(".hero h1")?.innerText'+
    '})'
   );

   assert(
    !ordinary.compactShell&&
    ordinary.originalChoices&&ordinary.adaptedChoices
   );
   assert.equal(ordinary.ruleItems,3);
   assert.equal(ordinary.rulesHeading,'How to play');
   assert(ordinary.heroText?.trim());
   receipt.observations.ordinary=ordinary;
   await shot('desktop-ordinary-comparison.png');
  }
 );

 await check(
  '320-explicit-2x-css-zoom-reflow-and-focused-target-reachability',
  async()=>{
   await browser.send('Emulation.setDeviceMetricsOverride',{
    width:320,height:844,deviceScaleFactor:1,mobile:false
   });
   await enterSetup();

   // Explicit fixture: no timer, focus, or application engine manipulation.
   await ev('document.documentElement.style.zoom="2"');
   zoomApplied=true;

   await focused('[data-game="pocket-signals"]');
   let s=await layout();
   noOverflow(s);
   assert.equal(Number(s.cssZoom),2,'The explicit 2x CSS zoom fixture must remain applied');
   let active=s.targets.find(t=>t.id===s.active);
   assert(
    active&&inside(active.rect,s.viewport),
    'Enlarged game choice unreachable'
   );
   await shot('320-css-zoom-2x-setup.png');

   await browser.key('Enter');
   await covered();
   await activate('#reveal-hand');
   await visible('[data-testid="private-hand"]');

   receipt.observations.cssZoom2xCycle=await cycle(true);
   await shot('320-css-zoom-2x-choices.png');

   await activate('#one-key-pause');
   await covered();
   await focused('#one-key-pause');
   s=await layout();
   noOverflow(s);
   assert.equal(Number(s.cssZoom),2,'The explicit 2x CSS zoom fixture must remain applied');
   active=s.targets.find(t=>t.id==='one-key-pause');
   assert(
    active&&inside(active.rect,s.viewport),
    'Enlarged Resume unreachable'
   );
   assert.match(s.pauseText,/resume/i);
   await shot('320-css-zoom-2x-resume.png');

   await ev('document.documentElement.style.zoom=""');
   zoomApplied=false;
  }
 );

 assert.equal(receipt.checks.length,7);
 assert(receipt.checks.every(c=>c.status==='passed'));
 inventoryGate();

 if(options.file){
  const after=await readFile(options.file);
  assert(after.equals(originalHTML),'HTML changed during receiving');
  receipt.artifact.sha256After=sha(after);
 }

 receipt.status='passed';
}catch(error){
 receipt.status='failed';
 receipt.failure={message:error.message,stack:error.stack};
 process.exitCode=1;

 if(browser){
  try{
   receipt.observations.failure=await layout();
   await shot('failure.png');
  }catch(diagnostic){
   receipt.diagnosticFailure=diagnostic.message;
  }
 }
}finally{
 if(browser){
  if(zoomApplied){
   try{
    await ev('document.documentElement.style.zoom=""');
   }catch(error){
    receipt.zoomRestoreFailure=error.message;
    receipt.status='failed';
    process.exitCode=1;
   }
  }

  try{
   await browser.close();
   receipt.browserClosed=true;
  }catch(error){
   receipt.browserCleanupFailure=error.message;
   receipt.status='failed';
   process.exitCode=1;
  }

  // Re-read retained arrays after close so late browser errors cannot pass.
  receipt.errors=[...browser.errors];
  receipt.requests=[...browser.requests];

  try{
   inventoryGate();
  }catch(error){
   receipt.finalInventoryFailure=error.message;
   receipt.status='failed';
   process.exitCode=1;
  }
 }

 if(server){
  try{
   await new Promise((resolve,reject)=>{
    server.close(error=>error?reject(error):resolve());
   });
   receipt.ownedServerClosed=true;
  }catch(error){
   receipt.serverCleanupFailure=error.message;
   receipt.status='failed';
   process.exitCode=1;
  }
 }

 receipt.finishedAt=new Date().toISOString();

 await writeFile(
  path.join(options.output,'receipt.json'),
  JSON.stringify(receipt,null,2)+'\n',
  {flag:'wx'}
 );

 process.stdout.write(JSON.stringify({
  status:receipt.status,
  checks:receipt.checks.length,
  passed:receipt.checks.filter(c=>c.status==='passed').length,
  receipt:path.join(options.output,'receipt.json')
 })+'\n');
}
