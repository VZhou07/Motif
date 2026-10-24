// Build-and-boot smoke: the whole Motif app inside the extension, under the extension CSP, with Chrome's fake camera.
// Labelled: NOT the real MotifSession gesture loop and NOT a real side panel (the page is opened in a tab).
import { check, finish, instrument, launchWithExtension } from './probe-lib.mjs';

const { context, extensionId, version } = await launchWithExtension();
console.log(`Chrome for Testing ${version}, extension ${extensionId} (fake camera, tab-hosted panel page)`);
const page = await context.newPage();
const log = await instrument(page);
await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
await page.waitForSelector('text=Get started', { timeout: 15_000 });
check('app renders under the extension CSP', true);
await page.click('text=Get started');
await page.waitForSelector('text=Start the rest check', { timeout: 60_000 }).catch(() => {});
const camera = await page.evaluate(() => { const v = document.querySelector('video'); return { playing: !!v && !v.paused && v.videoWidth > 0 }; });
check('local model loads and the fake camera plays', camera.playing);
await page.click('text=Start the rest check').catch(() => {});
await page.waitForTimeout(4_000); // audio cue unlock, spoken prompts and capture start
const blocked = await page.evaluate(() => window.motifBlockedRequests ?? 0);
check('zero Content-Security-Policy violations across load, model, camera, audio cues, speech and video', log.violations.length === 0, log.violations.slice(0, 4).join(' | '));
check('no console or page errors', log.errors.length === 0, log.errors.slice(0, 4).join(' | '));
check('no request left the extension', log.external.length === 0, log.external.slice(0, 3).join(' | '));
// MediaPipe's built-in usage logging tries to reach Google; the in-app guard refuses it before the network and the CSP is the second layer.
check('MediaPipe telemetry attempts were refused by the in-app guard, none reached the network', log.external.length === 0, `${blocked} guarded attempt(s)`);
// The camera grant page is a different page: it must not be able to issue worker commands (sender path check).
const grant = await context.newPage();
await grant.goto(`chrome-extension://${extensionId}/grant-camera.html`);
const refusal = await grant.evaluate(async () => {
  const message = { type: 'motif/bind', v: 1, panelId: 'grant', identityKey: 'local', accessEpoch: 0, tabId: 1, windowId: 1, origin: 'https://en.wikipedia.org' };
  return chrome.runtime.sendMessage(message);
});
check('the camera grant page is refused by the worker (sender-rejected)', refusal?.ok === false && refusal.reason === 'sender-rejected', JSON.stringify(refusal));
const grantRelease = await grant.evaluate(() => chrome.runtime.sendMessage({ type: 'motif/release', v: 1, panelId: 'grant' }));
check('the camera grant page cannot even release', grantRelease?.ok === false && grantRelease.reason === 'sender-rejected');
const panelReply = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'motif/release', v: 1, panelId: 'smoke' }));
check('the real panel page is accepted by the worker (control case)', panelReply?.ok === true, JSON.stringify(panelReply));
await context.close();
finish();
