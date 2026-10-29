// scripts/visibility-receive.mjs
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createAppServer } from '../server.mjs';
import { launchBrowser } from './browser-driver.mjs';

const output = resolve(
  process.env.OPEN_TABLE_VISIBILITY_DIR || 'receiving/visibility'
);
const startedPath = resolve(output, 'started.json');
const receiptPath = resolve(output, 'receipt.json');
const externalURL = process.env.OPEN_TABLE_RECEIVING_URL;
const filePath = process.env.OPEN_TABLE_RECEIVING_FILE
  ? resolve(process.env.OPEN_TABLE_RECEIVING_FILE)
  : null;

assert(!(externalURL && filePath), 'Choose URL or FILE receiving mode.');

await mkdir(output, { recursive: true });
for (const path of [startedPath, receiptPath]) {
  try {
    await access(path);
    throw new Error(`Use a fresh receiving directory: ${path} exists.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const startedAt = new Date().toISOString();
await writeFile(startedPath, JSON.stringify({
  schema: 'open-table.visibility-receiving.v1',
  status: 'started',
  startedAt,
  receiptPath,
}, null, 2), { flag: 'wx' });

const receipt = {
  schema: 'open-table.visibility-receiving.v1',
  status: 'running',
  startedAt,
  receiptPath,
  mode: filePath ? 'offline-built-file'
    : externalURL ? 'external-http' : 'local-source-http',
  source: {},
  driverPolicy: {
    flags: [
      '--headless=new',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
    sandbox: 'Existing driver policy; no --no-sandbox requested.',
    timingScope: 'Hidden-state behavior with background throttling disabled.',
    keyRoutingScope:
      'Late keyUp is sent to the app CDP session while hidden; this is not an OS keyUp routed to the other tab.',
  },
  groups: [],
  uncovered: [
    'Actual module disposal/remount.',
    'Asynchronous rerender or speed change while hidden.',
    'Private-state disclosure beyond curtain and private-title presence.',
    'Default-browser background throttling behavior.',
  ],
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let server;
let browser;
let appTarget;
let otherTarget;

async function state() {
  return browser.evaluate(`(() => {
    const q = s => document.querySelector(s);
    return {
      time: performance.now(),
      hidden: document.hidden,
      visibility: document.visibilityState,
      documentFocused: document.hasFocus(),
      focus: document.activeElement?.id || null,
      position: q('.track')?.getAttribute('aria-label') || null,
      choice: q('#confirm-choice')?.textContent || null,
      index: q('.scan-choices li.selected')?.getAttribute('data-scan-index') || null,
      running: q('#toggle-scan')?.getAttribute('aria-pressed') || null,
      speed: q('#scan-speed')?.value || null,
      covered: !!q('#reveal-hand'),
      privateVisible: !!q('#private-title'),
      scanPresent: !!q('#confirm-choice'),
      rounds: q('.rounds')?.textContent || '',
      live: q('[data-testid=public-live]')?.textContent || ''
    };
  })()`);
}

const cursor = s => ({ index: s.index, choice: s.choice });

async function waitFor(predicate, label, timeout = 4000) {
  const began = Date.now();
  let last;
  while (Date.now() - began < timeout) {
    last = await state();
    if (predicate(last)) return last;
    await sleep(40);
  }
  throw new Error(`${label}: ${JSON.stringify(last)}`);
}

async function hide() {
  await browser.send('Target.activateTarget', { targetId: otherTarget });
  return waitFor(s => s.hidden && s.visibility === 'hidden',
    'Real app target did not become hidden');
}

async function show() {
  await browser.send('Target.activateTarget', { targetId: appTarget });
  return waitFor(s => !s.hidden && s.visibility === 'visible',
    'Real app target did not become visible');
}

async function samples(duration = 3200, interval = 350) {
  const began = Date.now();
  const values = [];
  for (;;) {
    const s = await state();
    values.push({ elapsedMs: Date.now() - began, ...s });
    if (Date.now() - began >= duration) return values;
    await sleep(interval);
  }
}

function stableHidden(values, initial) {
  for (const s of values) {
    assert.equal(s.hidden, true);
    assert.equal(s.visibility, 'hidden');
    assert.deepEqual(cursor(s), cursor(initial), 'Hidden cursor advanced');
    assert.equal(s.position, initial.position, 'Hidden game state changed');
  }
}

async function group(name, fn) {
  const r = { name, status: 'running', startedAt: new Date().toISOString() };
  receipt.groups.push(r);
  try {
    await fn(r);
    r.status = 'passed';
  } catch (error) {
    r.status = 'failed';
    r.error = String(error.stack || error);
    try {
      r.failureState = await state();
      await browser.screenshot(`failure-${receipt.groups.length}.png`);
    } catch (captureError) {
      r.captureError = String(captureError);
    }
    throw error;
  } finally {
    r.finishedAt = new Date().toISOString();
  }
}

async function beacon() {
  await show();
  await browser.click('[data-game="beacon-steps"]');
  await browser.click('[data-pack="switch-select"]');
  const s = await waitFor(v => v.scanPresent, 'Ordinary scan controls missing');
  if (s.running === 'true') await browser.click('#toggle-scan');
  assert.equal((await state()).running, 'false');
}

async function start() {
  assert.equal((await state()).running, 'false');
  await browser.click('#toggle-scan');
  assert.equal((await state()).running, 'true');
}

async function freshDwell(r) {
  const activationStarted = Date.now();
  const visible = await show();
  const began = Date.now();
  r.foregroundActivationMs = began - activationStarted;
  r.visible = visible;
  assert.equal(visible.speed, '1400');
  r.foregroundSamples = [];

  // Sample rather than sleep once: catch early advancement, including wrapping.
  while (Date.now() - began < 1100) {
    const s = await state();
    const elapsedMs = Date.now() - began;
    r.foregroundSamples.push({ elapsedMs, ...s });
    assert.equal(s.hidden, false);
    assert.equal(s.position, visible.position);
    assert.deepEqual(cursor(s), cursor(visible),
      'Foreground scan advanced before the fresh dwell');
    await sleep(Math.min(100, Math.max(1, 1100 - elapsedMs)));
  }

  const finalStable = await state();
  r.stableThroughMs = Date.now() - began;
  r.finalStable = finalStable;
  assert(r.stableThroughMs < 1400,
    'Timing observation exceeded dwell; cannot interpret early-stability check');
  assert.deepEqual(cursor(finalStable), cursor(visible),
    'Foreground cursor advanced during the 1100ms stability window');
  assert.equal(finalStable.position, visible.position);

  r.resumed = await waitFor(
    s => s.index !== visible.index || s.choice !== visible.choice,
    'Foreground scan did not resume',
    2000
  );
  r.advanceObservedAfterMs = Date.now() - began;
  assert.equal(r.resumed.position, visible.position,
    'Foreground resumption selected an action');
}

try {
  if (!filePath && !externalURL) {
    server = createAppServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
  }
  const url = externalURL ||
    (server ? `http://127.0.0.1:${server.address().port}/` : null);

  browser = await launchBrowser(filePath ? {
    filePath,
    artifactRoot: dirname(filePath),
    offline: true,
    screenshotDir: output,
  } : {
    url,
    screenshotDir: output,
  });

  receipt.entryURL = browser.entryURL;
  receipt.offline = browser.offline;
  receipt.browserVersion = await browser.send('Browser.getVersion');
  try {
    receipt.browserCommandLine =
      await browser.send('Browser.getBrowserCommandLine');
  } catch (error) {
    receipt.browserCommandLineUnavailable = String(error);
  }

  if (filePath) {
    assert.equal(browser.offline, true);
    receipt.source.filePath = filePath;
    receipt.source.fileSha256 = digest(await readFile(filePath));
  } else {
    const served = await browser.evaluate(`(async () => {
      const response = await fetch('/src/app.js', {cache:'no-store'});
      if (!response.ok) throw new Error('App source HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', bytes);
      return {
        url: response.url,
        sha256: Array.from(new Uint8Array(hash),
          b => b.toString(16).padStart(2, '0')).join('')
      };
    })()`);
    receipt.source.servedAppURL = served.url;
    receipt.source.servedAppSha256 = served.sha256;
    if (server) {
      receipt.source.checkoutAppSha256 =
        digest(await readFile(new URL('../src/app.js', import.meta.url)));
      assert.equal(receipt.source.servedAppSha256,
        receipt.source.checkoutAppSha256,
        'Served app differs from receiver checkout');
    }
  }

  appTarget = (await browser.send('Target.getTargetInfo')).targetInfo.targetId;
  otherTarget = (await browser.send('Target.createTarget', {
    url: 'about:blank',
  })).targetId;

  await group('Active scan suspends and resumes after fresh dwell', async r => {
    await beacon();
    assert.equal((await state()).speed, '1400');
    await start();
    r.hiddenInitial = await hide();
    r.hiddenSamples = await samples();
    stableHidden(r.hiddenSamples, r.hiddenInitial);
    await freshDwell(r);
    await browser.screenshot('active-return.png');
  });

  await group('Manual pause survives hidden and visible transitions', async r => {
    await beacon();
    await start();
    await browser.click('#toggle-scan');
    r.hiddenInitial = await hide();
    r.hiddenSamples = await samples();
    stableHidden(r.hiddenSamples, r.hiddenInitial);
    r.returned = await show();
    r.visibleSamples = await samples(1800);
    for (const s of r.visibleSamples) {
      assert.equal(s.running, 'false');
      assert.deepEqual(cursor(s), cursor(r.returned));
      assert.equal(s.position, r.returned.position);
    }
  });

  await group('Private curtain does not resurrect ordinary scanner', async r => {
    await show();
    await browser.click('[data-game="pocket-signals"]');
    await browser.click('[data-pack="switch-select"]');
    await browser.click('#reveal-hand');
    await waitFor(s => s.scanPresent && s.privateVisible, 'Private hand missing');
    if ((await state()).running !== 'true') await start();
    await browser.click('#cover-hand');
    r.covered = await state();
    assert.equal(r.covered.covered, true);
    assert.equal(r.covered.privateVisible, false);
    assert.equal(r.covered.scanPresent, false);
    await hide();
    r.hiddenSamples = await samples(1800);
    r.returned = await show();
    await sleep(1700);
    r.afterDwell = await state();
    for (const s of [...r.hiddenSamples, r.returned, r.afterDwell]) {
      assert.equal(s.covered, true);
      assert.equal(s.privateVisible, false);
      assert.equal(s.scanPresent, false);
      assert.equal(s.rounds, r.covered.rounds);
    }
    await browser.screenshot('private-curtain-return.png');
  });

  await group('Held Space cancels and fresh Space remains usable', async r => {
    await beacon();
    await start();
    await browser.evaluate(
      'document.querySelector("#confirm-choice").focus();true'
    );
    r.before = await state();
    const key = {
      key: ' ', code: 'Space', windowsVirtualKeyCode: 32,
      text: ' ', unmodifiedText: ' ',
    };
    await browser.send('Input.dispatchKeyEvent', { ...key, type: 'keyDown' });
    r.hiddenInitial = await hide();
    r.hiddenSamples = await samples(1800);
    stableHidden(r.hiddenSamples, r.hiddenInitial);

    // Explicit app-session late release, not an OS event sent to the other tab.
    await browser.send('Input.dispatchKeyEvent', { ...key, type: 'keyUp' });
    r.lateRelease = await state();
    assert.equal(r.lateRelease.position, r.before.position);
    r.returned = await show();
    assert.equal(r.returned.position, r.before.position);
    if (r.returned.running === 'true') await browser.click('#toggle-scan');
    await browser.evaluate(
      'document.querySelector("#confirm-choice").focus();true'
    );
    r.beforeFresh = await state();
    await browser.key('Space');
    r.afterFresh = await state();
    assert.notEqual(r.afterFresh.position, r.beforeFresh.position,
      'Fresh Space did not confirm a Beacon action');
  });

  await group('Workshop does not retain a stale ordinary scanner', async r => {
    await beacon();
    await start();
    await browser.click('#workshop-tab');
    r.workshop = await state();
    assert.equal(r.workshop.scanPresent, false);
    await hide();
    r.hiddenSamples = await samples(1800);
    for (const s of r.hiddenSamples) {
      assert.equal(s.hidden, true);
      assert.equal(s.scanPresent, false);
    }
    await show();
    await sleep(1700);
    r.returned = await state();
    assert.equal(r.returned.scanPresent, false);
    assert.equal(r.returned.position, r.workshop.position);
    await browser.click('#play-tab');
    r.play = await state();
    assert.equal(r.play.scanPresent, true);
    await browser.screenshot('play-after-workshop.png');
  });

  await group('One-key setup does not resurrect ordinary scanner', async r => {
    await beacon();
    await start();
    await browser.click('#one-key-entry');
    r.setup = await state();
    assert.equal(r.setup.scanPresent, false);
    await hide();
    r.hiddenSamples = await samples(1800);
    for (const s of r.hiddenSamples) {
      assert.equal(s.hidden, true);
      assert.equal(s.scanPresent, false);
    }
    await show();
    await sleep(1700);
    r.returned = await state();
    assert.equal(r.returned.scanPresent, false);
    assert.equal(r.returned.position, r.setup.position);
    await browser.click('#one-key-exit');
    r.exited = await state();
    await browser.screenshot('ordinary-after-one-key.png');
  });

  receipt.browserErrors = [...browser.errors];
  assert.deepEqual(receipt.browserErrors, []);
  assert.equal(receipt.groups.length, 6);
  assert(receipt.groups.every(g => g.status === 'passed'));
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.error = String(error.stack || error);
  process.exitCode = 1;
} finally {
  if (browser) {
    // Capture application errors before shutting down owned browser targets.
    receipt.browserErrors = [...browser.errors];
    receipt.requests = browser.requests;
    if (otherTarget) {
      try {
        await browser.send('Target.closeTarget', { targetId: otherTarget });
      } catch (error) {
        receipt.otherTargetCleanupError = String(error);
      }
    }
    try {
      await browser.close();
    } catch (error) {
      receipt.browserCleanupError = String(error);
      receipt.status = 'failed';
      process.exitCode = 1;
    }
  }
  if (server) {
    try {
      await new Promise((resolveClose, rejectClose) =>
        server.close(error => error ? rejectClose(error) : resolveClose()));
    } catch (error) {
      receipt.serverCleanupError = String(error);
      receipt.status = 'failed';
      process.exitCode = 1;
    }
  }
  receipt.finishedAt = new Date().toISOString();
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2), { flag: 'wx' });
}

console.log(JSON.stringify({
  schema: receipt.schema,
  status: receipt.status,
  receiptPath,
  source: receipt.source,
  groups: receipt.groups.map(({ name, status }) => ({ name, status })),
}, null, 2));
