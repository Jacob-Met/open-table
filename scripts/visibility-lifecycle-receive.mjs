import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppServer } from '../server.mjs';
import { launchBrowser } from './browser-driver.mjs';

// Source lifecycle fixtures; production visibility changes still use real Chrome tabs.
const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const externalURL = process.env.OPEN_TABLE_RECEIVING_URL;
assert(!process.env.OPEN_TABLE_RECEIVING_FILE, 'Lifecycle fixtures require source modules over HTTP.');
const out = path.resolve(process.env.OPEN_TABLE_VISIBILITY_LIFECYCLE_DIR || 'receiving/visibility-lifecycle');
await mkdir(out, { recursive: true });
for (const name of ['started.json', 'receipt.json']) {
  try { await access(path.join(out, name)); throw new Error('Use a fresh receiving directory: '+out); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const schema = 'open-table.visibility-lifecycle-receiving.v1';
await writeFile(path.join(out, 'started.json'), JSON.stringify({ schema, startedAt: new Date().toISOString(), fixture: 'programmatic lifecycle controls; real browser tab activation' }, null, 2), { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], browserErrors = [];
let server, b, servedAppSha256, sourceAppSha256, fatal;
try {
  if (!externalURL) { server = createAppServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); }
  const url = externalURL || `http://127.0.0.1:${server.address().port}/`;
  const response = await fetch(new URL('/src/app.js', url));
  assert.equal(response.status, 200);
  servedAppSha256 = hash(Buffer.from(await response.arrayBuffer()));
  sourceAppSha256 = hash(await readFile(path.join(sourceRoot, 'src/app.js')));
  assert.equal(servedAppSha256, sourceAppSha256, 'Served app differs from source under review');
  b = await launchBrowser({ url, screenshotDir: out });
  const evaluate = expression => b.evaluate(expression);
  const state = () => evaluate(`(() => {const q=s=>document.querySelector(s);return {hidden:document.hidden,documentFocused:document.hasFocus(),position:q('.track')?.getAttribute('aria-label')||null,choice:q('#confirm-choice')?.textContent||null,toggle:q('#toggle-scan')?.getAttribute('aria-pressed')||null,speed:q('#scan-speed')?.value||null};})()`);
  async function mount(hidden = false) {
    await evaluate(`(async()=>{const {mountApp}=await import('/src/app.js');window.__visibilityFixtureApp=mountApp(document.querySelector('#app'),{gameId:'beacon-steps',oneKey:false});})()`);
    if (hidden) await evaluate(`(()=>{for(const s of ['[data-pack="switch-select"]','#toggle-scan']){const e=document.querySelector(s);if(!e)throw Error('Missing '+s);e.click();}})()`);
    else { await b.click('[data-pack="switch-select"]'); await b.click('#toggle-scan'); }
    const s = await state();
    assert.equal(s.toggle, 'true'); assert.ok(s.choice);
    assert.equal(s.hidden, hidden, 'Mount unexpectedly changed visibility');
  }
  async function stable(before, duration, hidden) {
    const began=Date.now(),until=began+duration; let s;
    do { s=await state(); assert.equal(s.hidden,hidden); assert.equal(s.choice,before.choice,'Selection advanced during stable interval'); assert.equal(s.position,before.position); await delay(50); } while(Date.now()<until);
    return {...s,observedStableMs:Date.now()-began,requestedStableMs:duration};
  }
  async function advances(before, duration) {
    const until=Date.now()+duration;
    do {const s=await state();assert.equal(s.hidden,false);assert.equal(s.position,before.position);if(s.choice!==before.choice)return s;await delay(50);}while(Date.now()<until);
    assert.fail('Visible scanner did not resume');
  }
  async function hiddenTab(run) {
    const original=(await b.send('Target.getTargetInfo')).targetInfo.targetId;
    const other=(await b.send('Target.createTarget',{url:'about:blank'})).targetId;
    async function restore(){await b.send('Target.activateTarget',{targetId:original});await b.send('Page.bringToFront');const until=Date.now()+2000;do{const s=await state();if(!s.hidden&&s.documentFocused)return s;await delay(25);}while(Date.now()<until);assert.fail('Could not restore visible focus');}
    try {await b.send('Target.activateTarget',{targetId:other});const until=Date.now()+2000;while(!(await state()).hidden&&Date.now()<until)await delay(25);assert.equal((await state()).hidden,true);assert.equal((await state()).documentFocused,false);return await run(restore);}finally{try{await restore();}finally{await b.send('Target.closeTarget',{targetId:other});}}
  }
  async function check(name, run) {try{checks.push({name,fixture:'programmatic lifecycle controls; real target activation',ok:true,evidence:await run()});}catch(error){checks.push({name,ok:false,error:String(error.stack||error)});}}
  await check('hidden delay change restores current controls with fresh dwell',async()=>{
    await mount();return hiddenTab(async restore=>{
      await evaluate(`(()=>{const s=document.querySelector('#scan-speed');s.value='2400';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      const hidden=await state();assert.equal(hidden.speed,'2400');await stable(hidden,2700,true);const visible=await restore();assert.equal(visible.choice,hidden.choice);assert.equal(visible.speed,'2400');const dwell=await stable(visible,1900,false);const resumed=await advances(visible,1500);return {hidden,visible,resumed,observedStableVisibleMs:dwell.observedStableMs};
    });
  });
  await check('hidden same-root remount retires detached controls',async()=>{
    await mount();return hiddenTab(async restore=>{
      await evaluate(`(()=>{window.__visibilityOldControl=document.querySelector('#confirm-choice');window.__visibilityOldText=window.__visibilityOldControl.textContent;})()`);
      await mount(true);const hidden=await state();await stable(hidden,1750,true);assert.equal(await evaluate('window.__visibilityOldControl.isConnected'),false);
      const visible=await restore();assert.equal(visible.choice,hidden.choice);await stable(visible,1100,false);const resumed=await advances(visible,1300);
      const until=Date.now()+3100;do{assert.equal(await evaluate('window.__visibilityOldControl.textContent===window.__visibilityOldText'),true,'Retired closure mutated detached controls');await delay(50);}while(Date.now()<until);
      return {hidden,visible,resumed,detachedControlsStayedFrozen:true};
    });
  });
  await check('destroy while hidden stays empty; subsequent mount advances',async()=>{
    await mount();await hiddenTab(async restore=>{await evaluate('window.__visibilityFixtureApp.destroy();window.__visibilityFixtureApp.destroy()');await restore();const until=Date.now()+1750;do{assert.equal(await evaluate("document.querySelector('#app').childNodes.length"),0);await delay(50);}while(Date.now()<until);});
    await mount();const fresh=await state();const resumed=await advances(fresh,2200);return {destroyedRootStayedEmpty:true,fresh,resumed};
  });

} catch(error) { fatal=String(error.stack||error); }
finally {
  if (b) browserErrors.push(...b.errors);
  try { await b?.close?.(); } catch(error) { browserErrors.push(String(error)); }
  try { if (server) await new Promise((resolveClose,rejectClose)=>server.close(error=>error?rejectClose(error):resolveClose())); } catch(error) { browserErrors.push(String(error)); }
  const receipt={schema,ok:!fatal&&checks.length===3&&checks.every(c=>c.ok)&&browserErrors.length===0,fixture:'source-only; programmatic lifecycle controls with genuine tab visibility transitions',servedAppSha256,sourceAppSha256,checks,browserErrors,...(fatal?{fatal}:{}),finishedAt:new Date().toISOString()};
  await writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
  if(!receipt.ok)process.exitCode=1;
}
