import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser-driver.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(process.env.OPEN_TABLE_BOUNDARY_DIR || resolve(root, 'receiving', `continuous-boundary-${Date.now()}`));
await mkdir(dirname(evidence), { recursive: true });
await mkdir(evidence); // Exclusive directory: never overwrite an earlier receiving run.
const receipt = { suite: 'continuous-boundary', startedAt: new Date().toISOString(), appSHA256: null, pass: false, courses: [], browserErrors: [] };
let server;
let baseURL;

const snapshotExpr = `(() => { const q=s=>document.querySelector(s); return {
 position:q('.track')?.getAttribute('aria-label')??null,
 covered:!!q('#reveal-hand'), privateVisible:!!q('#private-title'),
 hand:[...document.querySelectorAll('.playing-card')].map(x=>x.getAttribute('aria-label')),
 choice:q('#confirm-choice')?.textContent??null,
 toggle:q('#toggle-scan')?.getAttribute('aria-pressed')??null,
 result:q('.end-result')?.textContent??null, rounds:q('.rounds')?.textContent||'',
 live:q('[data-testid=public-live]')?.textContent||'', focus:document.activeElement?.id||''
 }; })()`;
const snap = b => b.evaluate(snapshotExpr);
function semantic(s) {
  // Live-region text is retained in evidence but may describe scan presentation.
  const { position, covered, privateVisible, hand, result, rounds } = s;
  return { position, covered, privateVisible, hand, result, rounds };
}
async function phase(b, key, type, autoRepeat = false) {
  const keys = { ' ': ['Space', 32], Enter: ['Enter', 13], Tab: ['Tab', 9], End: ['End', 35] };
  const [code, windowsVirtualKeyCode] = keys[key];
  const printable = key === ' ' || key === 'Enter';
  await b.send('Input.dispatchKeyEvent', {
    type: type === 'keyDown' && !printable ? 'rawKeyDown' : type,
    key, code, windowsVirtualKeyCode,
    ...(type === 'keyDown' ? { autoRepeat } : {}),
    ...(type === 'keyDown' && printable ? { text: key === ' ' ? ' ' : '\r', unmodifiedText: key === ' ' ? ' ' : '\r' } : {}),
  });
}
async function press(b, key) { await phase(b, key, 'keyDown'); await phase(b, key, 'keyUp'); }
async function focusByTab(b, id) {
  for (let n = 0; n < 40; n++) {
    if ((await snap(b)).focus === id) return;
    await press(b, 'Tab');
  }
  assert.fail(`Native Tab traversal did not reach ${id}`);
}
async function slowScan(b) {
  await b.click('#scan-speed');
  await press(b, 'End');
  await press(b, 'Enter');
  assert.equal(await b.evaluate(`document.querySelector('#scan-speed').value`), '4000');
}
async function mount(b, game) {
  await b.evaluate(`(async()=>{const g=await import('/src/games.js'),a=await import('/src/app.js');
    const game=${JSON.stringify(game)};
    const initial=game==='pocket-signals'?g.initialStates(game).find(s=>JSON.stringify(s.hands)==='[[2,4],[1,3]]'):g.initialStates(game)[0];
    if(!initial)throw Error('Missing deterministic fixture');
    a.mountApp(document.getElementById('app'),{gameId:game,initialState:initial});return true;})()`);
  await b.click('[data-pack="switch-select"]');
  const wasCovered = (await snap(b)).covered;
  if (wasCovered) await b.click('#reveal-hand');
  await slowScan(b);
  if (wasCovered) await b.click('#cover-hand');
}
let browserSerial = 0;
async function browser(label, run, timerProbe = false) {
  const folder = resolve(evidence, `${++browserSerial}-${label}`);
  await mkdir(folder);
  const b = await launchBrowser({ url: baseURL, profileDir: resolve(folder, 'profile'), screenshotDir: folder });
  try {
    if (timerProbe) await b.evaluate(`(() => {
      const nativeSet=window.setInterval.bind(window),nativeClear=window.clearInterval.bind(window);
      const records=new Map();
      window.__boundaryTimers={records, active:()=>[...records.values()].filter(r=>r.active).map(r=>r.id)};
      window.setInterval=(fn,delay,...args)=>{
        const id=nativeSet(fn,delay,...args);records.set(id,{id,active:true,invoke:()=>fn(...args)});return id;
      };
      window.clearInterval=id=>{const r=records.get(id);if(r)r.active=false;return nativeClear(id);};
      return true;
    })()`);
    const result = await run(b);
    await b.screenshot('final.png');
    return result;
  } finally {
    receipt.browserErrors.push(...(b.errors || []).map(error => ({ browser: label, error })));
    await b.close();
  }
}
function covered(s) {
  assert.equal(s.covered, true, 'Private handoff must show Reveal');
  assert.equal(s.privateVisible, false, 'Private title must be removed');
  assert.deepEqual(s.hand, [], 'Private cards must be absent');
}
function assertSingleAdvance(before, after) {
  const delta = before.choice?.match(/Advance ([12])/);
  const from = before.position?.match(/marker at (\d+)/i);
  const to = after.position?.match(/marker at (\d+)/i);
  assert.ok(delta && from && to, 'Expected Beacon choice and marker labels');
  assert.equal(Number(to[1]), Number(from[1]) + Number(delta[1]), 'Physical press must advance exactly once');
}
async function keyBoundaries() {
  const publicEvidence = await browser('public-keys', async b => {
    await mount(b, 'beacon-steps');
    await focusByTab(b, 'toggle-scan');
    const toggleBefore = await snap(b);
    await phase(b, ' ', 'keyDown');
    assert.equal((await snap(b)).toggle, toggleBefore.toggle, 'Space down must not toggle');
    await phase(b, ' ', 'keyUp');
    const enabled = await snap(b);
    assert.equal(enabled.toggle, 'true');
    assert.equal(enabled.focus, 'confirm-choice');
    assert.deepEqual(semantic(enabled), semantic(toggleBefore), 'Toggle release must not confirm');
    await phase(b, 'Enter', 'keyDown');
    const moved = await snap(b);
    assertSingleAdvance(enabled, moved);
    for (let n = 0; n < 3; n++) await phase(b, 'Enter', 'keyDown', true);
    await phase(b, 'Enter', 'keyUp');
    assert.deepEqual(semantic(await snap(b)), semantic(moved), 'Held Enter/release must not make another move');
    const beforeFresh = await snap(b);
    await press(b, 'Enter');
    const fresh = await snap(b);
    assertSingleAdvance(beforeFresh, fresh);
    await phase(b, ' ', 'keyDown');
    assert.deepEqual(semantic(await snap(b)), semantic(fresh), 'Space down must not confirm');
    for (let n = 0; n < 3; n++) await phase(b, ' ', 'keyDown', true);
    assert.deepEqual(semantic(await snap(b)), semantic(fresh), 'Repeated Space down must not confirm');
    await phase(b, ' ', 'keyUp');
    const released = await snap(b);
    assertSingleAdvance(fresh, released);
    return { toggleBefore, enabled, moved, fresh, released };
  });
  const privateEvidence = await browser('private-keys', async b => {
    await mount(b, 'pocket-signals');
    if ((await snap(b)).covered) await b.click('#reveal-hand');
    await b.click('#toggle-scan');
    assert.equal((await snap(b)).focus, 'confirm-choice');
    await phase(b, 'Enter', 'keyDown');
    const handoff = await snap(b); covered(handoff);
    for (let n = 0; n < 3; n++) await phase(b, 'Enter', 'keyDown', true);
    await phase(b, 'Enter', 'keyUp');
    covered(await snap(b));
    assert.deepEqual(semantic(await snap(b)), semantic(handoff));
    await focusByTab(b, 'reveal-hand');
    await phase(b, ' ', 'keyDown'); covered(await snap(b));
    await phase(b, ' ', 'keyUp');
    const revealed = await snap(b);
    assert.equal(revealed.covered, false);
    assert.equal(revealed.privateVisible, true);
    assert.deepEqual(revealed.hand, ['Card 1, circle', 'Card 3, square'], 'Reveal release must expose only the next hand and must not play a card');
    return { handoff, revealed };
  });
  return { publicEvidence, privateEvidence };
}
async function obsoleteTimers() {
  return browser('obsolete-timer', async b => {
    await mount(b, 'beacon-steps');
    const active = () => b.evaluate('window.__boundaryTimers.active()');
    assert.deepEqual(await active(), []);
    await b.click('#toggle-scan');
    const first = await active(); assert.equal(first.length, 1);
    await b.click('#toggle-scan');
    const paused = await snap(b); assert.deepEqual(await active(), []);
    await b.evaluate(`window.__boundaryTimers.records.get(${JSON.stringify(first[0])}).invoke()`);
    const afterOldPaused = await snap(b);
    assert.deepEqual(afterOldPaused, paused, 'Obsolete paused callback changed DOM');
    await b.click('#toggle-scan');
    const second = await active(); assert.equal(second.length, 1); assert.notEqual(second[0], first[0]);
    const resumed = await snap(b);
    await b.evaluate(`window.__boundaryTimers.records.get(${JSON.stringify(first[0])}).invoke()`);
    assert.deepEqual(await snap(b), resumed, 'Old epoch callback affected resumed scanner');
    await b.evaluate(`window.__boundaryTimers.records.get(${JSON.stringify(second[0])}).invoke()`);
    const advanced = await snap(b);
    assert.notEqual(advanced.choice, resumed.choice, 'One current tick must advance scan');
    assert.deepEqual(semantic(advanced), semantic(resumed), 'Scanning must not play a move');
    assert.equal((await active()).length, 1);
    await b.click('#workshop-tab');
    const navigation = await snap(b); assert.deepEqual(await active(), []);
    await b.evaluate(`window.__boundaryTimers.records.get(${JSON.stringify(second[0])}).invoke()`);
    assert.deepEqual(await snap(b), navigation, 'Obsolete callback changed workshop');
    return { paused, afterOldPaused, resumed, advanced, navigation };
  }, true);
}
async function transcript(game, baseline = null) {
  return browser(`${game}-${baseline ? 'continuous' : 'manual'}`, async b => {
    await mount(b, game);
    const turns = game === 'beacon-steps' ? 7 : 4;
    const steps = [];
    let enabled = false;
    for (let i = 0; i < turns; i++) {
      if ((await snap(b)).covered) await b.click('#reveal-hand');
      if (baseline && !enabled) { await b.click('#toggle-scan'); enabled = true; }
      if (baseline) {
        for (let attempts = 0; (await snap(b)).choice !== baseline.steps[i].before.choice; attempts++) {
          assert.ok(attempts < 8, 'Could not select baseline choice');
          await b.click('#next-choice');
        }
      }
      const before = await snap(b); assert.ok(before.choice, 'Expected nonterminal choice');
      if (baseline) assert.deepEqual(semantic(before), semantic(baseline.steps[i].before), `Turn ${i} pre-state differs`);
      await b.click('#confirm-choice');
      const after = await snap(b);
      if (baseline) assert.deepEqual(semantic(after), semantic(baseline.steps[i].after), `Turn ${i} post-state differs`);
      steps.push({ before, after });
    }
    const final = await snap(b);
    assert.ok(final.result?.trim(), 'Fixed transcript must reach terminal result');
    if (baseline) assert.deepEqual(semantic(final), semantic(baseline.final));
    return { game, steps, final };
  });
}
async function parity() {
  const results = [];
  for (const game of ['beacon-steps', 'pocket-signals']) {
    const manual = await transcript(game);
    const continuous = await transcript(game, manual);
    results.push({ manual, continuous });
  }
  return results;
}
try {
  receipt.appSHA256 = createHash('sha256').update(await readFile(resolve(root, 'src/app.js'))).digest('hex');
  if (process.env.OPEN_TABLE_RECEIVING_URL) {
    const url = new URL(process.env.OPEN_TABLE_RECEIVING_URL);
    assert.ok(['http:', 'https:'].includes(url.protocol));
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Receiving URL must be loopback');
    assert.ok(!url.username && !url.password, 'Receiving URL must not contain credentials');
    baseURL = url.href;
  } else {
    const { createAppServer } = await import('../server.mjs');
    const created = await createAppServer();
    server = created?.server || created;
    assert.equal(typeof server.listen, 'function', 'createAppServer must return an HTTP server or {server}');
    if (!server.listening) await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
    const address = server.address();
    baseURL = `http://127.0.0.1:${address.port}/`;
  }
  receipt.url = baseURL;
  // Establish that an externally started receiver serves this exact source app.
  const served = await fetch(new URL('/src/app.js', baseURL), { redirect: 'error' });
  assert.equal(served.status, 200);
  receipt.servedAppSHA256 = createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex');
  assert.equal(receipt.servedAppSHA256, receipt.appSHA256, 'Served app differs from tested source');
  for (const [name, run] of [['key-release', keyBoundaries], ['obsolete-timer', obsoleteTimers], ['transcript-parity', parity]]) {
    const course = { name, pass: false };
    receipt.courses.push(course);
    try { course.evidence = await run(); course.pass = true; }
    catch (error) { course.failure = error.stack || String(error); throw error; }
  }
  assert.deepEqual(receipt.browserErrors, [], 'Browser reported errors');
  receipt.pass = true;
} catch (error) {
  receipt.failure = error.stack || String(error);
  process.exitCode = 1;
} finally {
  if (server?.listening) await new Promise((res, rej) => server.close(error => error ? rej(error) : res())).catch(error => {
    receipt.cleanupFailure = error.stack || String(error); receipt.pass = false; process.exitCode = 1;
  });
  receipt.finishedAt = new Date().toISOString();
  await writeFile(resolve(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ pass: receipt.pass, receipt: resolve(evidence, 'receipt.json'), failure: receipt.failure || null }));
}
