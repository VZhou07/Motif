// Automated browser check. Uses Chrome's built-in synthetic test camera
// (--use-fake-device-for-media-stream); the real webcam is never opened. Run after `npm run build`.
// The synthetic pattern has no face, so screens after calibration are covered by unit/RTL tests
// and the manual checklist (ACCEPTANCE.md), not here.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createServer, preview } from 'vite';

const PORT = 4317;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const results = [];
const LIMIT = process.env.CHECK_DETAIL === 'all' ? Infinity : 4;
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

async function launch(extraArgs) {
  const args = ['--use-fake-device-for-media-stream', ...extraArgs];
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true, args }); } catch { /* try the next installed browser */ }
  }
  // No Chrome or Edge (e.g. a Linux server): use Playwright's bundled Chromium (`npx playwright install chromium`).
  try { return await chromium.launch({ headless: true, args }); } catch { /* reported below */ }
  throw new Error('No browser could be launched: install Chrome or Edge, or run `npx playwright install chromium`.');
}

/** A page that records external requests, console errors (MediaPipe's "INFO:" logs excepted), page errors and HTTP errors. */
async function openPage(browser, { width = 1280, init, origin = ORIGIN } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const log = { external: [], errors: [], csp: 0 };
  // Counts Content-Security-Policy refusals across every load of this page: the in-app guard should block first, so this stays 0.
  await page.exposeFunction('reportCspViolation', () => { log.csp += 1; });
  await page.addInitScript(() => {
    window.cspViolations = 0;
    document.addEventListener('securitypolicyviolation', () => { window.cspViolations += 1; window.reportCspViolation?.(); });
  });
  if (init) await page.addInitScript(init);
  page.on('request', (request) => { const url = request.url(); if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) log.external.push(url); });
  page.on('console', (message) => { if (message.type() === 'error' && !/^INFO: /.test(message.text())) log.errors.push(message.text()); });
  page.on('pageerror', (error) => log.errors.push(`pageerror: ${error.message}`));
  page.on('response', (response) => { if (response.status() >= 400) log.errors.push(`HTTP ${response.status()} ${response.url()}`); });
  return { page, log };
}

/**
 * In-page audit of every visible text node (WCAG AA contrast, 12 px minimum) and every visible
 * enabled button (44 × 44 px). Text over images or the live video is reported as unverifiable.
 */
function audit() {
  const parse = (value) => {
    let match = /rgba?\(([^)]+)\)/.exec(value);
    if (match) { const p = match[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    match = /color\(srgb ([^)]+)\)/.exec(value);
    if (match) { const p = match[1].split(/[\s/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 }; }
    return null;
  };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const luminance = ({ r, g, b }) => {
    const channel = (value) => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const opacity = (element) => { let total = 1; for (let node = element; node; node = node.parentElement) total *= Number(getComputedStyle(node).opacity); return total; };
  const page = parse(getComputedStyle(document.documentElement).backgroundColor);
  const base = page && page.a > 0 ? { ...page, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  /** Background behind an element, or null when an image or the live video makes it unverifiable. */
  const background = (element) => {
    const layers = [];
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' || node.classList.contains('camera-preview')) return null;
      const color = parse(style.backgroundColor);
      if (color && color.a > 0) { layers.push({ ...color, a: color.a * Number(style.opacity) }); if (color.a >= 1) break; }
    }
    return layers.reverse().reduce((under, layer) => blend(layer, under), base);
  };
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };
  const failures = [];
  const small = [];
  let unverifiable = 0;
  let checked = 0;
  for (const element of document.querySelectorAll('body *')) {
    if (!visible(element) || element.closest('.sr-only, [aria-hidden="true"], :disabled')) continue;
    if (![...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
    const style = getComputedStyle(element);
    const size = parseFloat(style.fontSize);
    const text = element.textContent.trim().slice(0, 40);
    if (size < 12) small.push(`${text} (${size}px)`);
    const color = parse(style.color);
    const behind = background(element);
    if (!color || !behind) { unverifiable += 1; continue; }
    checked += 1;
    const foreground = blend({ ...color, a: color.a * opacity(element) }, behind);
    const large = size >= 24 || (Number(style.fontWeight) >= 700 && size >= 18.66);
    const value = ratio(foreground, behind);
    if (value < (large ? 3 : 4.5)) failures.push(`${text} (${value.toFixed(2)}:1)`);
  }
  const targets = [...document.querySelectorAll('button')].filter((button) => visible(button) && !button.disabled)
    .map((button) => ({ text: (button.getAttribute('aria-label') || button.textContent).trim().slice(0, 30), rect: button.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 44 || rect.height < 44).map(({ text, rect }) => `${text} (${Math.round(rect.width)}×${Math.round(rect.height)})`);
  /** Outline colour of the scan highlight against what surrounds it (3:1 for non-text indicators). */
  const scanned = document.querySelector('.is-scanned');
  const outline = scanned ? ratio(parse(getComputedStyle(scanned).outlineColor), background(scanned.parentElement) ?? base) : null;
  return { failures, small, targets, unverifiable, checked, outline };
}

async function auditScreen(page, label) {
  const report = await page.evaluate(audit);
  check(`contrast AA on every visible text: ${label}`, report.failures.length === 0 && report.checked > 0,
    report.failures.length ? report.failures.slice(0, LIMIT).join('; ') : `${report.checked} checked, ${report.unverifiable} over images/video`);
  check(`text at least 12 px: ${label}`, report.small.length === 0, report.small.slice(0, LIMIT).join('; '));
  check(`buttons at least 44 × 44 px: ${label}`, report.targets.length === 0, report.targets.slice(0, LIMIT).join('; '));
  if (report.outline !== null) check(`scan highlight outline reaches 3:1: ${label}`, report.outline >= 3, `${report.outline.toFixed(2)}:1`);
}

/** Walks the Tab order: every stop must show a ≥ 2 px outline (scan highlight removed) and focus must never be trapped or hidden. */
async function focusWalk(page, label) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const problems = [];
  const seen = new Set();
  let stops = 0;
  let completed = false;
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return { key: 'body' };
      element.dataset.walk ??= String(Math.random());
      const scanned = element.classList.contains('is-scanned');
      if (scanned) element.classList.remove('is-scanned');
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const result = { key: element.dataset.walk, name: (element.getAttribute('aria-label') || element.textContent || element.tagName).trim().slice(0, 30),
        outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 2, visible: rect.width > 0 && rect.height > 0 };
      if (scanned) element.classList.add('is-scanned');
      return result;
    });
    if (stop.key === 'body' || seen.has(stop.key)) { completed = true; break; }
    seen.add(stop.key);
    stops += 1;
    if (!stop.visible) problems.push(`hidden: ${stop.name}`);
    else if (!stop.outline) problems.push(`no focus outline: ${stop.name}`);
  }
  check(`keyboard focus is visible at every Tab stop: ${label}`, problems.length === 0 && stops > 0, problems.length ? problems.slice(0, LIMIT).join('; ') : `${stops} stops`);
  check(`Tab order completes without a trap: ${label}`, completed);
}

/**
 * A saved profile in the version 1 entry format earlier builds wrote (six flat phrases), so the browser
 * exercises migration on read (R14). Built with the app's own validator, then turned back into version 1.
 */
async function seededProfile() {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { buildProfile, parseProfile } = await vite.ssrLoadModule('/src/app/profiles.ts');
    const { STARTER_PHRASES } = await vite.ssrLoadModule('/src/app/types.ts');
    const { defaultVocabulary } = await vite.ssrLoadModule('/src/app/vocabulary.ts');
    const model = { id: 'browOuterUpLeft:1:1', label: 'Raise left outer eyebrow', feature: 'browOuterUpLeft', direction: 1,
      baselineCenter: 0.1, activationThreshold: 0.3, releaseThreshold: 0.15, activationMs: 250, releaseMs: 350 };
    const built = buildProfile({ name: 'Seeded', models: [model], mapping: { assignments: { [model.id]: 'select' }, mode: 'auto' }, vocabulary: defaultVocabulary(), scanIntervalMs: 2_000 });
    if (!built.ok) throw new Error(built.reasons.join('; '));
    const { vocabulary: _vocabulary, ...rest } = built.value;
    const v1 = { ...rest, version: 1, phrases: STARTER_PHRASES };
    if (!parseProfile(v1).ok) throw new Error('seeded version 1 profile does not migrate');
    return JSON.stringify({ version: 1, profiles: [v1] });
  } finally { await vite.close(); }
}

const server = await preview({ preview: { port: PORT, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
let failed = false;
try {
  await mkdir('test-results', { recursive: true });
  const seeded = await seededProfile();

  // 1. Fake camera granted: model loads locally, frames flow, no face means no valid input.
  const browser = await launch(['--use-fake-ui-for-media-stream']);
  const { page, log } = await openPage(browser);
  await page.goto(ORIGIN);
  check('welcome screen renders', await page.getByRole('heading', { level: 1 }).textContent().then((text) => /Your movement/.test(text ?? '')));
  await auditScreen(page, 'welcome 1280 px');
  await focusWalk(page, 'welcome');
  await page.getByText('Helper settings: spoken prompts and phrases').click();
  await auditScreen(page, 'helper settings open');
  await page.getByRole('button', { name: /Start camera/ }).first().click();
  await page.getByText('Live · local').waitFor({ timeout: 45_000 });
  check('local model and fake camera start', true);
  await page.getByRole('button', { name: 'Movement signal dashboard' }).click();
  await page.getByText(/Tracking: missing\./).waitFor({ timeout: 20_000 });
  check('real inference runs and reports no face in the synthetic pattern', true);
  // Stopping the camera closes the model, which flushes MediaPipe's built-in usage logger.
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await page.waitForTimeout(1_500);
  const offline = await page.evaluate(async () => {
    const probe = await fetch('https://example.com/').then(() => 'sent', () => 'blocked');
    return { blocked: window.motifBlockedRequests ?? 0, probe, csp: window.cspViolations };
  });
  check('usage logging and other outside requests are blocked inside the app', offline.blocked >= 2 && offline.probe === 'blocked' && offline.csp === 0
    && log.external.length === 0, JSON.stringify(offline));
  await page.getByRole('button', { name: /Start camera/ }).first().click();
  await page.getByText('Live · local').waitFor({ timeout: 45_000 });
  await auditScreen(page, 'camera running, dashboard open');
  await page.getByRole('button', { name: /Start the rest check/ }).click();
  await page.waitForTimeout(3_000);
  const progress = await page.getByRole('progressbar', { name: /baseline recording progress/ }).getAttribute('value');
  check('no face produces no rest-check progress (fails closed)', progress === '0', `progress=${progress}`);
  await auditScreen(page, 'rest-check capture');
  await page.screenshot({ path: 'test-results/browser-baseline-no-face.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop setup' }).click();
  await page.getByRole('button', { name: /Use assisted input/ }).click();
  await auditScreen(page, 'assisted communication, empty message 1280 px');
  await page.setViewportSize({ width: 900, height: 900 });
  await auditScreen(page, 'assisted communication, empty message 900 px');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.keyboard.press('Space');
  const message = await page.getByRole('region', { name: 'Message' }).textContent();
  check('assisted Space adds the highlighted phrase', /Yes/.test(message ?? ''), message ?? '');
  await auditScreen(page, 'assisted communication 1280 px');
  await focusWalk(page, 'assisted communication');
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0 }));
  check('nothing persisted to browser storage', storage.local === 0 && storage.session === 0 && storage.databases === 0, JSON.stringify(storage));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const transition = await page.locator('.button').first().evaluate((element) => getComputedStyle(element).transitionDuration);
  check('reduced motion disables transitions', /^0s(, 0s)*$/.test(transition), transition);
  await page.setViewportSize({ width: 900, height: 900 });
  await auditScreen(page, 'assisted communication 900 px');
  await page.reload();
  await page.getByRole('heading', { level: 1 }).waitFor();
  check('reload starts clean: no message, nothing stored', await page.getByRole('region', { name: 'Message' }).count() === 0
    && await page.evaluate(() => localStorage.length) === 0);
  await auditScreen(page, 'welcome 900 px');
  check('no requests leave this device', log.external.length === 0, log.external.slice(0, LIMIT).join(', '));
  check('no Content-Security-Policy refusals were needed on any load', log.csp === 0, `${log.csp}`);
  check('no console or page errors', log.errors.length === 0, log.errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: 'test-results/browser-assisted.png', fullPage: true });

  // 2. Saved profiles across reloads: a corrupted payload is reported; a valid one restores only into the rest check.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => localStorage.setItem('motif.profiles', '{not json'));
  await page.reload();
  check('a corrupted saved payload is reported as unreadable', await page.getByText(/could not be read. Use Delete all/).isVisible());
  await page.evaluate((value) => localStorage.setItem('motif.profiles', value), seeded);
  await page.reload();
  const restore = page.getByRole('button', { name: 'Restore “Seeded”' });
  check('a saved profile is listed and needs the camera to restore', await restore.isDisabled());
  await page.getByRole('button', { name: /Start camera/ }).first().click();
  await page.getByText('Live · local').waitFor({ timeout: 45_000 });
  await restore.click();
  await page.waitForTimeout(2_000);
  check('a restored profile stays unarmed in the rest check without a face', await page.getByText('STEP 1 · YOUR RESTING BASELINE').isVisible()
    && await page.getByRole('button', { name: 'Speak message' }).count() === 0
    && await page.getByRole('progressbar', { name: /baseline recording progress/ }).getAttribute('value') === '0');
  await page.evaluate(() => localStorage.clear());
  await browser.close();

  // 3. Camera permission denied: honest message, assisted path still available.
  const denied = await launch(['--deny-permission-prompts']);
  const { page: deniedPage } = await openPage(denied);
  await deniedPage.goto(ORIGIN);
  await deniedPage.getByRole('button', { name: /Start camera/ }).first().click();
  const alert = deniedPage.getByRole('alert').first();
  await alert.waitFor({ timeout: 45_000 });
  const alertText = await alert.textContent();
  // Headless prompt denial surfaces as an unusable camera; true permission refusal is stubbed below.
  check('camera blocked by the browser is explained', /No usable camera|permission was not granted/.test(alertText ?? ''), alertText ?? '');
  check('assisted input remains available after the camera is blocked', await deniedPage.getByRole('button', { name: /assisted input/i }).isVisible());
  await auditScreen(deniedPage, 'camera denied');
  await denied.close();

  // 4. Other failures, each explained with assisted input still available and no page errors.
  const failures = await launch(['--use-fake-ui-for-media-stream']);
  const scenarios = [
    { name: 'model file blocked', route: '**/models/*.task', expect: /face model could not load/ },
    { name: 'model runtime blocked', route: '**/mediapipe/wasm/**', expect: /face model could not load/ },
    { name: 'camera permission refused', init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); }, expect: /permission was not granted/ },
    { name: 'no camera device', init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('none', 'NotFoundError')); }, expect: /No usable camera/ },
    { name: 'camera in use elsewhere', init: () => { navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('busy', 'NotReadableError')); }, expect: /in use by another app/ },
    { name: 'camera API unsupported', init: () => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); }, expect: /Chrome or Edge on localhost or HTTPS/ },
  ];
  for (const scenario of scenarios) {
    const { page: failing, log: failingLog } = await openPage(failures, { init: scenario.init });
    if (scenario.route) await failing.route(scenario.route, (route) => route.abort());
    await failing.goto(ORIGIN);
    await failing.getByRole('button', { name: /Start camera/ }).first().click();
    const text = await failing.getByRole('alert').first().textContent({ timeout: 45_000 }).catch(() => '');
    const assisted = await failing.getByRole('button', { name: /assisted input/i }).first().isVisible();
    const pageErrors = failingLog.errors.filter((error) => error.startsWith('pageerror'));
    check(`${scenario.name}: explained, assisted input available, nothing leaves the device`,
      scenario.expect.test(text ?? '') && assisted && pageErrors.length === 0 && failingLog.external.length === 0,
      `${text ?? ''}${pageErrors.length ? ` | ${pageErrors[0]}` : ''}${failingLog.external.length ? ` | external: ${failingLog.external[0]}` : ''}`);
    if (scenario.name === 'model file blocked') await auditScreen(failing, 'model load error');
    await failing.close();
  }

  // 5. Browser storage blocked: the app still works.
  const { page: blocked, log: blockedLog } = await openPage(failures, {
    init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); },
  });
  await blocked.goto(ORIGIN);
  const heading = await blocked.getByRole('heading', { level: 1 }).textContent();
  await blocked.getByRole('button', { name: /Use assisted input/ }).click();
  await blocked.keyboard.press('Space');
  const storageNotice = await blocked.getByText(/Saved profiles/).count();
  check('blocked browser storage: the app loads, shows no saved-profile error, and assisted input works', /Your movement/.test(heading ?? '') && storageNotice === 0
    && /Yes/.test(await blocked.getByRole('region', { name: 'Message' }).textContent() ?? '') && blockedLog.errors.length === 0, blockedLog.errors.slice(0, 2).join(' | '));
  await blocked.close();

  // 6. No local speech voice: the message stays visible, the limitation is explained, nothing is sent to a voice.
  const { page: silent, log: silentLog } = await openPage(failures, {
    init: () => {
      window.speakCalls = 0;
      if (window.speechSynthesis) {
        window.speechSynthesis.getVoices = () => [];
        window.speechSynthesis.speak = () => { window.speakCalls += 1; };
      }
    },
  });
  await silent.goto(ORIGIN);
  await silent.getByRole('button', { name: /Use assisted input/ }).click();
  await silent.keyboard.press('Space');
  await silent.getByRole('button', { name: 'Speak message' }).click();
  const shown = await silent.getByRole('region', { name: 'Message' }).textContent();
  check('no local voice: message stays on screen, limitation explained, no speech call',
    /Yes/.test(shown ?? '') && await silent.getByText(/No local speech voice is available/).isVisible() && await silent.evaluate(() => window.speakCalls) === 0
      && silentLog.errors.length === 0);
  await silent.close();
  await failures.close();

  // 7. Development server: the Content-Security-Policy does not break hot reload or model loading.
  const dev = await createServer({ server: { port: PORT + 1, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
  await dev.listen();
  const devBrowser = await launch(['--use-fake-ui-for-media-stream']);
  const { page: devPage, log: devLog } = await openPage(devBrowser, { origin: `http://127.0.0.1:${PORT + 1}` });
  const connected = new Promise((resolve) => devPage.on('console', (message) => { if (/\[vite\] connected/.test(message.text())) resolve(true); }));
  await devPage.goto(`http://127.0.0.1:${PORT + 1}`);
  const hot = await Promise.race([connected, new Promise((resolve) => setTimeout(() => resolve(false), 20_000))]);
  await devPage.getByRole('button', { name: /Start camera/ }).first().click();
  await devPage.getByText('Live · local').waitFor({ timeout: 60_000 });
  check('dev server: hot reload connects and the model loads under the security policy', hot === true
    && await devPage.evaluate(() => window.cspViolations) === 0 && devLog.external.length === 0,
    JSON.stringify({ hot, csp: await devPage.evaluate(() => window.cspViolations), external: devLog.external.slice(0, 2), errors: devLog.errors.slice(0, 2) }));
  await devBrowser.close();
  await dev.close();
} catch (error) {
  failed = true;
  console.error('FAIL  browser check aborted —', error instanceof Error ? error.message : error);
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} browser checks passed.`);
if (failed || passed !== results.length) process.exitCode = 1;
