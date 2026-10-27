import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createAppServer} from '../server.mjs';
import {launchBrowser} from './browser-driver.mjs';
import {createPack} from '../src/pack.js';

// Runs against the receiving build when a URL is supplied; otherwise the repo server.
const outputDir = resolve(process.env.OPEN_TABLE_RECEIVING_DIR || 'artifacts/pack-import-browser');
await mkdir(outputDir, {recursive:true});
const filesDir = await mkdtemp(join(tmpdir(), 'open-table-import-'));
let server, b;
const results = [];
const receipt = {suite:'pack-import-browser', startedAt:new Date().toISOString(), cases:results};
const q = JSON.stringify;
const settle = () => b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
const snapshot = () => b.evaluate(`(() => {
  const text = s => document.querySelector(s)?.textContent?.trim() ?? null;
  return {
    game: [...document.querySelectorAll('[data-game]')].filter(e=>e.getAttribute('aria-pressed')==='true').map(e=>e.dataset.game),
    pack: [...document.querySelectorAll('[data-pack]')].filter(e=>e.getAttribute('aria-pressed')==='true').map(e=>e.dataset.pack),
    track: [...document.querySelectorAll('.track')].map(e=>e.getAttribute('aria-label')),
    privateTitle:text('#private-title'), reveal:!!document.querySelector('#reveal-hand'),
    privateChoices:!!document.querySelector('[data-testid=choice-comparison]'), privateHand:!!document.querySelector('[data-testid=private-hand]'), privateCards:document.querySelectorAll('[data-testid=private-hand] .playing-card').length, handoff:!!document.querySelector('[data-testid=handoff]'),
    status:text('[data-testid="pack-status"]'), live:text('[data-testid="public-live"]'),
    tableTitle:text('#table-title'), workshop:!!document.querySelector('#workshop-title')
  };
})()`);
async function upload(path) {
  const {root} = await b.send('DOM.getDocument');
  const {nodeId} = await b.send('DOM.querySelector', {nodeId:root.nodeId, selector:'#pack-file'});
  assert.ok(nodeId, 'actual pack file input must exist');
  await b.send('DOM.setFileInputFiles', {nodeId,files:[path]});
  await settle();
  if(!path.split('/').at(-1).startsWith('deferred-')) {
    const expected=path.endsWith('/invalid.json')?'Could not open pack: ':'Pack reopened and checked again against the current rules.';
    await b.evaluate(`(async()=>{for(let i=0;i<100;i++){if(document.querySelector('[data-testid=pack-status]')?.textContent?.trim().startsWith(${q(expected)}))return;await new Promise(r=>setTimeout(r,20));}throw new Error('Import status did not settle');})()`);
  }
}
async function waitPending(name) {
  await b.evaluate(`(async()=>{for(let i=0;i<100;i++){if(window.__packReads.has(${q(name)}))return;await new Promise(r=>setTimeout(r,20));}throw new Error('File.text did not reach deferred read: '+${q(name)})})()`);
}
async function release(name, reject=false) {
  await b.evaluate(`(()=>{const p=window.__packReads.get(${q(name)});if(!p)throw new Error('Missing pending read');window.__packReads.delete(${q(name)});${reject ? "p.reject(new Error('deliberate file read failure'))" : 'p.resolve(p.bytes)'};})()`);
  await settle();
}
async function mount(gameId='beacon-steps') {
  await b.evaluate(`(async()=>{
    window.__fixtureHandle?.destroy();
    const app=await import('/src/app.js');const g=await import('/src/games.js');
    window.__fixtureHandle=app.mountApp(document.getElementById('app'),{gameId:${q(gameId)},initialState:g.initialStates(${q(gameId)})[0]});
  })()`);
  await settle();
}
async function begin(path) { await upload(path); await waitPending(path.split('/').at(-1)); }
async function sameAfter(name, before, rejected=false) {
  await release(name,rejected);
  assert.deepEqual(await snapshot(),before,'stale completion must preserve observable current state and status');
}
async function test(name,fn) {
  const entry={name};results.push(entry);
  try { await fn();entry.passed=true; }
  catch(error) {entry.passed=false;entry.error=String(error.stack||error);try{entry.observed=await snapshot();entry.screenshot=`pack-import-failure-${results.length}.png`;await b.screenshot(entry.screenshot);}catch(captureError){entry.captureError=String(captureError);}}
}

try {
  let url=process.env.OPEN_TABLE_RECEIVING_URL;
  if (!url) {server=createAppServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;}
  receipt.url=url;
  b=await launchBrowser({url,screenshotDir:outputDir});
  await b.evaluate(`(()=>{
    const original=File.prototype.text;
    window.__packReads=new Map();
    File.prototype.text=async function(){
      const bytes=await original.call(this);
      if(!this.name.startsWith('deferred-'))return bytes;
      return new Promise((resolve,reject)=>window.__packReads.set(this.name,{bytes,resolve,reject}));
    };
  })()`);
  const makePack = title => title==='Regression pack B' ? createPack('pocket-signals','shape-text') : createPack('beacon-steps','switch-select');
  async function fixture(name,title,invalid=false) {
    const path=join(filesDir,name);const value=invalid?'not valid JSON':makePack(title);
    await writeFile(path,typeof value==='string'?value:JSON.stringify(value));return path;
  }
  const a=await fixture('deferred-a.json','Regression pack A');
  const c=await fixture('deferred-b.json','Regression pack B');
  const good=await fixture('valid.json','Regression valid pack');
  const bad=await fixture('invalid.json','',true);
  await test('current valid import changes observable pack state',async()=>{
    await mount();const before=await snapshot();await upload(good);const after=await snapshot();
    assert.notDeepEqual(after,before,'valid import must have an observable effect');
    assert.ok(after.game.includes('beacon-steps'),'valid import selects its game');
    assert.ok(after.pack.includes('switch-select'),'valid import selects its adapter');
    assert.equal(after.status,'Pack reopened and checked again against the current rules.','valid import reports success');
  });
  await test('current malformed import reports rejection and preserves game',async()=>{
    await mount();const before=await snapshot();await upload(bad);const after=await snapshot();
    assert.ok(after.status?.startsWith('Could not open pack: '),'malformed import reports an error');
    assert.deepEqual({...after,status:null},{...before,status:null});
  });
  await test('slow A cannot replace faster newer B',async()=>{
    await mount();await begin(a);await begin(c);await release('deferred-b.json');
    const applied=await snapshot();assert.ok(applied.game.includes('pocket-signals'));assert.ok(applied.pack.includes('shape-text'));assert.equal(applied.status,'Pack reopened and checked again against the current rules.');
    await sameAfter('deferred-a.json',await snapshot());
  });
  await test('slow valid A cannot replace latest rejected import',async()=>{
    await mount();await begin(a);await upload(bad);await sameAfter('deferred-a.json',await snapshot());
  });
  await test('explicit pack choice supersedes pending import',async()=>{
    await mount();await begin(a);await b.click('[data-pack="shape-text"]');await settle();
    const current=await snapshot();assert.ok(current.pack.includes('shape-text'));await sameAfter('deferred-a.json',current);
  });
  await test('explicit game choice supersedes pending import',async()=>{
    await mount();await begin(a);await b.click('[data-game="pocket-signals"]');await settle();
    const current=await snapshot();assert.ok(current.game.includes('pocket-signals'));await sameAfter('deferred-a.json',current);
  });
  await test('actual legal turn supersedes pending import',async()=>{
    await mount();await begin(a);const before=await snapshot();await b.click('[data-choice="0"]');await settle();
    const current=await snapshot();assert.notDeepEqual(current,before,'real action advances observable game');await sameAfter('deferred-a.json',current);
  });
  await test('private handoff and intended reveal survive stale completion',async()=>{
    await mount('pocket-signals');await b.click('#reveal-hand');await begin(a);
    await b.click('[data-choice="0"]');await settle();const handoff=await snapshot();
    assert.ok(handoff.reveal && handoff.handoff,'handoff must hide hand behind reveal control');
    assert.equal(handoff.privateChoices,false,'covered private choices are absent from DOM');assert.equal(handoff.privateHand,false,'covered hand is absent from DOM');assert.equal(handoff.privateCards,0);assert.equal(handoff.privateTitle,null);
    await sameAfter('deferred-a.json',handoff);await b.click('#reveal-hand');await settle();
    const revealed=await snapshot();assert.equal(revealed.reveal,false,'intended player can reveal after handoff');assert.ok(revealed.privateChoices && revealed.privateHand && revealed.privateCards>0);assert.match(revealed.privateTitle,/Player 2/);
  });
  await test('Save pack render preserves current pending import',async()=>{
    await mount();await begin(a);await b.click('#save-pack');await settle();
    assert.match((await snapshot()).status,/Pack saved with its rule pin/);
    await release('deferred-a.json');const current=await snapshot();assert.ok(current.pack.includes('switch-select'));assert.equal(current.status,'Pack reopened and checked again against the current rules.');
  });
  await test('no-file early return after DOM input clear preserves pending import',async()=>{
    await mount();await begin(a);
    // Standard DOM input clearing plus a synthetic change tests only the no-file early return.
    // This does not represent native picker cancellation or clicking the Open pack button.
    await b.evaluate(`(()=>{const input=document.querySelector('#pack-file');input.value='';if(input.files.length!==0)throw new Error('Input clear left selected files');input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await settle();
    assert.equal(await b.evaluate('document.querySelector("#pack-file").files.length'),0);
    await release('deferred-a.json');assert.equal((await snapshot()).status,'Pack reopened and checked again against the current rules.');
  });
  await test('private reveal alone supersedes pending import',async()=>{
    await mount('pocket-signals');assert.equal((await snapshot()).privateHand,false);await begin(a);
    await b.click('#reveal-hand');await settle();const revealed=await snapshot();assert.ok(revealed.privateHand&&revealed.privateCards>0);assert.equal(revealed.reveal,false);
    await sameAfter('deferred-a.json',revealed);
  });
  await test('stale read rejection cannot overwrite newer success',async()=>{
    await mount();await begin(a);await upload(good);await sameAfter('deferred-a.json',await snapshot(),true);
  });
  await test('automatic same-root replacement ignores stale success and rejection',async()=>{
    for(const reject of [false,true]) {
    await mount();await begin(a);
    await b.evaluate(`(()=>{window.__oldNodes=[...document.getElementById('app').childNodes];window.__oldNodeHTML=window.__oldNodes.map(n=>n.outerHTML);})()`);
    await b.evaluate(`(async()=>{const app=await import('/src/app.js');const g=await import('/src/games.js');window.__fixtureHandle=app.mountApp(document.getElementById('app'),{gameId:'pocket-signals',initialState:g.initialStates('pocket-signals')[0]});})()`);
    await settle();await sameAfter('deferred-a.json',await snapshot(),reject);
    assert.deepEqual(await b.evaluate('window.__oldNodes.map(n=>n.outerHTML)'),await b.evaluate('window.__oldNodeHTML'),'old detached content and live region remain unchanged');
    }
  });
  for(const reject of [false,true]) await test(`destroy/remount ignores stale ${reject?'rejection':'success'}`,async()=>{
    await mount();await begin(a);
    await b.evaluate(`(()=>{window.__oldNodes=[...document.getElementById('app').childNodes];window.__oldNodeHTML=window.__oldNodes.map(n=>n.outerHTML);window.__fixtureHandle.destroy();window.__fixtureHandle=null;window.__detachedRoot=document.getElementById('app');window.__detachedRoot.replaceWith(Object.assign(document.createElement('div'),{id:'app'}));window.__detachedHTML=window.__detachedRoot.innerHTML;})()`);
    await mount('pocket-signals');await sameAfter('deferred-a.json',await snapshot(),reject);
    assert.equal(await b.evaluate('window.__detachedRoot.innerHTML'),await b.evaluate('window.__detachedHTML'),'destroyed detached root remains unchanged');
    assert.deepEqual(await b.evaluate('window.__oldNodes.map(n=>n.outerHTML)'),await b.evaluate('window.__oldNodeHTML'),'destroyed content and live region remain unchanged');
  });
  await test('obsolete destroy handle cannot clear newer mount',async()=>{
    await mount();await b.evaluate(`(async()=>{window.__oldHandle=window.__fixtureHandle;const app=await import('/src/app.js');const g=await import('/src/games.js');window.__fixtureHandle=app.mountApp(document.getElementById('app'),{gameId:'pocket-signals',initialState:g.initialStates('pocket-signals')[0]});})()`);
    await settle();const current=await snapshot();assert.ok(current.game.includes('pocket-signals'));
    await b.evaluate('window.__oldHandle.destroy()');await settle();assert.deepEqual(await snapshot(),current,'old handle may not clear newer app');
  });
  await mount('pocket-signals');
  await b.screenshot('pack-import-play.png');
  await b.click('#workshop-tab');await settle();await b.screenshot('pack-import-workshop.png');
  receipt.browserErrors=b.errors;
  if(Array.isArray(b.errors)&&b.errors.length)results.push({name:'browser console/runtime errors',passed:false,errors:b.errors});
} catch(error) {results.push({name:'suite setup or teardown',passed:false,error:String(error.stack||error)});}
finally {
  if(b)await b.close();
  if(server)await new Promise(r=>server.close(r));
  receipt.finishedAt=new Date().toISOString();receipt.passed=results.length>0&&results.every(x=>x.passed);
  await writeFile(join(outputDir,'pack-import-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt,null,2));
  if(!receipt.passed)process.exitCode=1;
}
