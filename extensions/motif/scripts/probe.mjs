// Machine probe of the browser loop. NOT THE REAL SESSION: the scan list is a stand-in (ToySession) and the Space key
// is dispatched as an event, standing in for an approved gesture. It does run the real manifest, service worker,
// port, controller and Chrome APIs in Chrome for Testing with Chrome's fake camera. It proves nothing about gestures,
// the real side panel, real visibility or a real face.
//   npx vite build --config extensions/motif/vite.config.ts --mode probe --configLoader runner
//   node extensions/motif/scripts/probe.mjs
import http from 'node:http';
import path from 'node:path';
import { check, finish, here, instrument, launchWithExtension } from './probe-lib.mjs';

const dist = path.resolve(here, '../dist-probe');
const servers = [];
async function serve(label) {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<html><body style="margin:0"><h1>${label} ${request.url}</h1><div style="height:6000px">tall</div></body></html>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return `http://127.0.0.1:${server.address().port}`;
}
const A = await serve('A');
const B = await serve('B');
const { context, worker, extensionId, version } = await launchWithExtension(dist);
console.log(`Chrome for Testing ${version}; extension ${extensionId}; fake camera; stand-in session (NOT the real MotifSession)`);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const snap = (panel) => panel.evaluate(() => window.__probe.snapshot());
// Hands the port a fully valid-looking command, bypassing the tile list, to prove the lower layers refuse it too.
const forceScroll = (panel, epochs) => panel.evaluate(async (given) => {
  const p = window.__probe;
  const now = performance.now();
  return p.port.execute({ version: 1, id: `forced-${Math.random()}`, action: 'scroll-down', inputEpoch: given?.input ?? p.session.getInputEpoch(),
    accessEpoch: given?.access ?? p.care.identity.epoch, issuedAtMs: now, expiresAtMs: now + 600 });
}, epochs);
async function press(panel, id) {
  await panel.evaluate((tile) => { window.__probe.highlight(tile); window.__probe.pressSpace(); }, id);
  await wait(400);
}

const web = await context.newPage();
const C = `http://localhost:${new URL(A).port}`; // same server, but "localhost" is NOT covered by the probe build's install-time grant
await web.goto(`${C}/c`);
const panel = await context.newPage();
const log = await instrument(panel);
await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await panel.waitForFunction(() => window.__probe?.lockHeld === true, null, { timeout: 15_000 });
check('harness boots under the extension CSP and holds the single-runtime lock', log.violations.length === 0 && log.errors.length === 0, [...log.violations, ...log.errors].slice(0, 3).join(' | '));

// A second copy of the page must not run.
const second = await context.newPage();
await second.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await second.waitForFunction(() => window.__probe, null, { timeout: 15_000 });
check('a second runtime copy is refused by the Web Lock', (await second.evaluate(() => window.__probe.lockHeld)) === false);
await second.close();

// The harness page is a background tab here and is driven through evaluate; the web tab is the active tab of the window.
await web.bringToFront();

// 1. A site without permission: Browse must be refused with a reason and leave the person on messages.
await press(panel, 'browse');
let s = await snap(panel);
check('Browse is refused on a site without permission, and the person stays on messages', s.scope === 'communication' && s.state.phase === 'idle' && !!s.state.message, `${s.state.code}`);

// 2. U3: ask Chrome for that site from a trusted helper click. Headless Chrome cannot answer the prompt, so this is recorded, not assumed.
await panel.fill('#site', C);
await panel.click('#allow');
await wait(3_000);
const askedChrome = await worker.evaluate((origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }), C);
check(`U3 optional-permission request from a trusted click ${askedChrome ? 'was granted' : 'was not answerable headlessly (still UNVERIFIED)'}`, true, String(askedChrome));
if (askedChrome) await worker.evaluate((origin) => chrome.permissions.remove({ origins: [`${origin}/*`] }), C);
console.log('      probe build grants 127.0.0.1 at install (host_permissions) because headless Chrome cannot answer the prompt; the shipped manifest has none.');
await web.goto(`${A}/a`);
const haveGrant = await worker.evaluate((origin) => chrome.permissions.contains({ origins: [`${origin}/*`] }), A);
if (!haveGrant) {
  console.log('NOT PROVEN: the page-control loop needs a granted origin and headless Chrome could not grant one. Recorded as a limitation.');
  check('page-control loop (needs a granted origin)', false, 'headless Chrome could not grant optional host permission');
} else {
  await web.bringToFront();
  // 3. The loop: Browse -> Scroll -> Scroll -> Back -> Return -> request tile.
  await press(panel, 'browse');
  s = await snap(panel);
  check('Browse binds the active allowed tab and enters browser scope', s.scope === 'browser' && s.binding?.origin === A, JSON.stringify(s.binding));
  const y0 = await web.evaluate(() => window.scrollY);
  await press(panel, 'browser:scroll-down');
  const y1 = await web.evaluate(() => window.scrollY);
  check('one selection scrolls the real page once', y1 > y0, `${y0} -> ${y1}`);
  await press(panel, 'browser:scroll-down');
  const y2 = await web.evaluate(() => window.scrollY);
  check('a second selection scrolls again', y2 > y1, `${y1} -> ${y2}`);
  await press(panel, 'browser:scroll-up');
  const y3 = await web.evaluate(() => window.scrollY);
  check('Scroll up moves back up', y3 < y2, `${y2} -> ${y3}`);
  await web.goto(`${A}/b`);
  await web.waitForLoadState('load');
  await wait(300);
  s = await snap(panel);
  check('same-origin navigation keeps control', s.scope === 'browser' && s.binding !== null);
  await press(panel, 'browser:back');
  await wait(600);
  check('Back returns to the earlier page', (await web.url()).endsWith('/a'), await web.url());
  await press(panel, 'pause');
  s = await snap(panel);
  check('Pause keeps browser scope and the binding', s.paused && s.scope === 'browser' && s.binding !== null);
  const yPaused = await web.evaluate(() => window.scrollY);
  await panel.evaluate(() => window.__probe.pressSpace()); // resumes
  await wait(300);
  await press(panel, 'browser:return');
  s = await snap(panel);
  check('Return goes back to messages and releases the binding', s.scope === 'communication' && s.binding === null);
  const storeAfterReturn = await worker.evaluate(() => chrome.storage.session.get('motif.binding'));
  check('the worker also forgot the binding', !storeAfterReturn['motif.binding']);
  await press(panel, 'request:water');
  s = await snap(panel);
  check('a request tile is still reachable and acts exactly once', s.careCalls.length === 1 && s.careCalls[0] === 'request:water' && (await web.evaluate(() => window.scrollY)) === yPaused);
  // The page must not have been scrolled by the request selection, and no browser effect was recorded for it.
  check('one event cannot both scroll and send', s.effects.filter((e) => e === 'care:request:water').length === 1);

  // 4. Fail-closed cases.
  await web.bringToFront();
  await press(panel, 'browse');
  await panel.evaluate(() => window.__probe.session.frame('missing'));
  await wait(300);
  s = await snap(panel);
  check('tracking loss returns to messages and releases', s.scope === 'communication' && s.binding === null && s.state.code === 'tracking-lost');
  await panel.evaluate(() => window.__probe.session.frame('tracked'));
  const before = await web.evaluate(() => window.scrollY);
  const forced = await forceScroll(panel);
  check('even a forged valid-looking command after tracking loss cannot scroll', forced.status === 'rejected' && (await web.evaluate(() => window.scrollY)) === before, `${forced.reason}`);

  await press(panel, 'browse');
  await web.goto(`${B}/other`);
  await wait(500);
  s = await snap(panel);
  check('navigating to a different (even loopback) origin ends control', s.scope === 'communication' && s.binding === null, String(s.state.code));
  await web.goto(`${A}/a`);

  await press(panel, 'browse');
  const oldAccess = await panel.evaluate(() => window.__probe.care.identity.epoch);
  await panel.evaluate(() => window.__probe.care.set({ participantId: 'B', alias: 'Bea' }));
  await wait(300);
  s = await snap(panel);
  check('changing the person ends control and clears the worker binding', s.scope === 'communication' && s.binding === null && !(await worker.evaluate(() => chrome.storage.session.get('motif.binding')))['motif.binding']);
  const yB = await web.evaluate(() => window.scrollY);
  const replay = await forceScroll(panel, { access: oldAccess });
  check('the previous person\'s command cannot run as the new person', replay.status === 'rejected' && (await web.evaluate(() => window.scrollY)) === yB, `${replay.reason}`);

  // 4b. The new person must choose Browse again; control then belongs to them. Then the two-window case.
  await web.bringToFront();
  await press(panel, 'browse');
  s = await snap(panel);
  check('the new person can start fresh and the binding names them', s.scope === 'browser' && s.binding?.identityKey === 'participant:B', JSON.stringify(s.binding?.identityKey));
  await press(panel, 'browser:return');
  const second2 = await worker.evaluate(async (url) => { const w = await chrome.windows.create({ url, focused: true }); return w.id; }, `${A}/second-window`);
  await wait(800);
  await press(panel, 'browse');
  s = await snap(panel);
  const focusedActive = await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); return { windowId: tabs[0]?.windowId, tabId: tabs[0]?.id }; });
  check('with two windows Browse binds the active tab of the last focused window (what the user is looking at)', s.binding?.windowId === focusedActive.windowId && s.binding?.tabId === focusedActive.tabId,
    `bound window ${s.binding?.windowId}, last focused ${focusedActive.windowId}, second window ${second2}`);
  if (s.scope === 'browser') await press(panel, 'browser:return');
}

// 5. Entry points an attacker might try.
const pageWorld = await web.evaluate(() => ({ chromeRuntime: typeof (window.chrome && window.chrome.runtime && window.chrome.runtime.sendMessage) }));
check('a web page sees no extension messaging API (no externally_connectable)', pageWorld.chromeRuntime === 'undefined', pageWorld.chromeRuntime);
const fromPage = await web.evaluate(async (id) => {
  try { return await window.chrome.runtime.sendMessage(id, { type: 'motif/release', v: 1, panelId: 'x' }); } catch (error) { return `error: ${error.message}`; }
}, extensionId);
check('sending to the extension id from a web page is refused by Chrome', typeof fromPage === 'string' && fromPage.startsWith('error'), String(fromPage));
await panel.close();
await context.close();
servers.forEach((server) => server.close());
finish();
