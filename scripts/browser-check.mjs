// Automated browser smoke check. Uses Chrome's built-in synthetic test camera
// (--use-fake-device-for-media-stream); the real webcam is never opened. Run after `npm run build`.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

const PORT = 4317;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`); };

async function launch(extraArgs) {
  const args = ['--use-fake-device-for-media-stream', ...extraArgs];
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel, headless: true, args }); } catch { /* try the next installed browser */ }
  }
  throw new Error('Neither Chrome nor Edge could be launched by Playwright.');
}

const server = await preview({ preview: { port: PORT, host: '127.0.0.1', strictPort: true }, logLevel: 'error' });
let failed = false;
try {
  await mkdir('test-results', { recursive: true });
  // 1. Fake camera granted: model loads locally, frames flow, no face means no valid input.
  const browser = await launch(['--use-fake-ui-for-media-stream']);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const external = [];
  const consoleErrors = [];
  page.on('request', (request) => { const url = request.url(); if (!url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) external.push(url); });
  page.on('console', (message) => {
    // MediaPipe writes informational native logs ("INFO: ...") through console.error.
    if (message.type() === 'error' && !/^INFO: /.test(message.text())) consoleErrors.push(message.text());
  });
  page.on('response', (response) => { if (response.status() >= 400) consoleErrors.push(`HTTP ${response.status()} ${response.url()}`); });
  await page.goto(ORIGIN);
  check('welcome screen renders', await page.getByRole('heading', { level: 1 }).textContent().then((text) => /Your movement/.test(text ?? '')));
  await page.getByRole('button', { name: /Start camera/ }).first().click();
  await page.getByText('Live · local').waitFor({ timeout: 45_000 });
  check('local model and fake camera start', true);
  await page.getByRole('button', { name: 'Movement signal dashboard' }).click();
  await page.getByText(/Tracking: missing\./).waitFor({ timeout: 20_000 });
  check('real inference runs and reports no face in the synthetic pattern', true);
  await page.getByRole('button', { name: /Start the rest check/ }).click();
  await page.waitForTimeout(3_000);
  const progress = await page.getByRole('progressbar', { name: /baseline recording progress/ }).getAttribute('value');
  check('no face produces no rest-check progress (fails closed)', progress === '0', `progress=${progress}`);
  await page.screenshot({ path: 'test-results/browser-baseline-no-face.png', fullPage: true });
  await page.getByRole('button', { name: 'Stop setup' }).click();
  await page.getByRole('button', { name: /Use assisted input/ }).click();
  await page.keyboard.press('Space');
  const message = await page.getByRole('region', { name: 'Message' }).textContent();
  check('assisted Space adds the highlighted phrase', /Yes/.test(message ?? ''), message ?? '');
  const storage = await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length,
    databases: typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).length : 0 }));
  check('nothing persisted to browser storage', storage.local === 0 && storage.session === 0 && storage.databases === 0, JSON.stringify(storage));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const transition = await page.locator('.button').first().evaluate((element) => getComputedStyle(element).transitionDuration);
  check('reduced motion disables transitions', /^0s(, 0s)*$/.test(transition), transition);
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '');
  check('keyboard focus reaches interactive controls', ['A', 'BUTTON', 'INPUT', 'SUMMARY'].includes(focused), focused);
  check('no requests leave this device', external.length === 0, external.slice(0, 3).join(', '));
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  await page.screenshot({ path: 'test-results/browser-assisted.png', fullPage: true });
  await browser.close();

  // 2. Camera permission denied: honest message, assisted path still available.
  const denied = await launch(['--deny-permission-prompts']);
  const deniedPage = await denied.newPage();
  await deniedPage.goto(ORIGIN);
  await deniedPage.getByRole('button', { name: /Start camera/ }).first().click();
  const alert = deniedPage.getByRole('alert').first();
  await alert.waitFor({ timeout: 45_000 });
  const alertText = await alert.textContent();
  check('camera denial is explained', /permission|camera/i.test(alertText ?? ''), alertText ?? '');
  check('assisted input remains available after denial', await deniedPage.getByRole('button', { name: /assisted input/i }).isVisible());
  await denied.close();
} catch (error) {
  failed = true;
  console.error('FAIL  browser check aborted —', error instanceof Error ? error.message : error);
} finally {
  await new Promise((resolve) => server.httpServer.close(resolve));
}
const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} browser checks passed.`);
if (failed || passed !== results.length) process.exitCode = 1;
