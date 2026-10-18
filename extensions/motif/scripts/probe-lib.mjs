// Shared helpers for the machine probes. Uses Chrome for Testing from an existing Playwright cache or CHROME_BIN.
// Chrome's FAKE camera device is used; the real webcam is never opened. Nothing here is the real MotifSession.
import { existsSync, readdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const dist = path.resolve(here, '../dist');

export function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const cache = path.join(homedir(), 'Library/Caches/ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      const arm = path.join(cache, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      if (existsSync(arm)) return arm;
    }
  }
  throw new Error('No Chrome for Testing found. Set CHROME_BIN to a Chrome for Testing binary (branded Chrome ignores --load-extension).');
}

export async function launchWithExtension(extensionDir = dist) {
  if (!existsSync(path.join(extensionDir, 'manifest.json'))) throw new Error(`Build the extension first (no manifest in ${extensionDir}).`);
  const profile = mkdtempSync(path.join(tmpdir(), 'motif-probe-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: findChrome(), headless: true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
  return { context, worker, extensionId: new URL(worker.url()).host, version: context.browser()?.version() };
}

/** Records Content-Security-Policy violations, console errors and page errors for every load of a page. */
export async function instrument(page) {
  const log = { violations: [], errors: [], external: [] };
  await page.exposeFunction('motifReportViolation', (text) => { log.violations.push(text); });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      window.motifReportViolation(`${event.violatedDirective} blocked ${event.blockedURI || 'inline'} (${event.sourceFile || ''})`);
    });
  });
  page.on('console', (message) => { if (message.type() === 'error' && !/^INFO: /.test(message.text())) log.errors.push(message.text()); });
  page.on('pageerror', (error) => log.errors.push(`pageerror: ${error.message}`));
  page.on('request', (request) => { const url = request.url(); if (!url.startsWith('chrome-extension://') && !url.startsWith('data:') && !url.startsWith('blob:')) log.external.push(url); });
  return log;
}

export const results = [];
export function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
}
export function finish() {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} checks passed`);
  process.exitCode = failed ? 1 : 0;
}
