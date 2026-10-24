// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'vite';
import { connectSources } from './csp';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const assetsPresent = existsSync(path.join(repo, 'public/models/face_landmarker.task')) && existsSync(path.join(repo, 'public/mediapipe/wasm/vision_wasm_internal.wasm'))
  && existsSync(path.join(repo, 'public/runtime-assets.json'));
// The build needs the gitignored model/WASM assets (npm run setup:assets). Without them this suite is skipped, which progress.md records as a gap.
const suite = assetsPresent ? describe : describe.skip;

/** Remote URLs allowed to appear as text in emitted JavaScript: XML namespaces, React's error link, and MediaPipe's own telemetry endpoint (refused by the in-app guard and the CSP). */
const ALLOWED_URL = /^(http:\/\/www\.w3\.org\/|https:\/\/react\.dev\/errors\/|https:\/\/odml\.pa\.googleapis\.com\/v1\/log$)/;

suite('built extension output', () => {
  let out = '';
  const read = (file: string) => readFileSync(path.join(out, file), 'utf8');
  const walk = (dir: string): string[] => readdirSync(path.join(out, dir), { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));

  beforeAll(async () => {
    out = mkdtempSync(path.join(tmpdir(), 'motif-dist-'));
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production'; // Vitest sets "test"; the shipped bundle must be the production one.
    try {
      await build({ configFile: path.join(repo, 'extensions/motif/vite.config.ts'), configLoader: 'runner', mode: 'production', logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
    } finally { process.env.NODE_ENV = previous; }
  }, 180_000);
  afterAll(() => { if (out) rmSync(out, { recursive: true, force: true }); });

  it('has the manifest permissions exactly, with nothing broad', () => {
    const manifest = JSON.parse(read('manifest.json'));
    expect(manifest.permissions).toEqual(['sidePanel', 'scripting', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://127.0.0.1/*', 'http://localhost/*']);
    expect(JSON.stringify(manifest)).not.toMatch(/<all_urls>|"tabs"|activeTab|content_scripts|externally_connectable|web_accessible_resources/);
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(manifest.content_security_policy.extension_pages).toContain("default-src 'self'");
    expect(existsSync(path.join(out, manifest.background.service_worker))).toBe(true);
    expect(existsSync(path.join(out, manifest.side_panel.default_path))).toBe(true);
  });

  it('pages carry no inline script, handler attribute or absolute URL, and a policy that matches the manifest', () => {
    const manifest = JSON.parse(read('manifest.json'));
    for (const page of ['sidepanel.html', 'grant-camera.html']) {
      const html = read(page);
      expect(html, page).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
      expect(html, page).not.toMatch(/\son[a-z]+\s*=/i);
      expect(html, page).not.toMatch(/https?:\/\//i);
      expect(html, page).toContain('Content-Security-Policy');
    }
    const meta = /Content-Security-Policy" content="([^"]+)"/.exec(read('sidepanel.html'))![1]!;
    expect(connectSources(meta)).toEqual(connectSources(manifest.content_security_policy.extension_pages));
    expect(meta).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(read('grant-camera.html')).toContain("connect-src 'none'");
    expect(read('grant-camera.html')).not.toContain('wasm-unsafe-eval');
  });

  it('emits only our own scripts and no remote URL beyond the known allowlist', () => {
    const scripts = walk('.').filter((file) => file.endsWith('.js') && !file.startsWith('mediapipe'));
    expect(scripts.length).toBeGreaterThan(2);
    const found = new Set<string>();
    for (const file of scripts) for (const url of read(file).match(/https?:\/\/[A-Za-z0-9./_?=#%-]+/g) ?? []) found.add(url);
    const unexpected = [...found].filter((url) => !ALLOWED_URL.test(url));
    expect(unexpected).toEqual([]);
    expect(read('background.js')).not.toMatch(/https?:\/\//);
  });

  it('packages the local model and WASM, and they match the runtime asset manifest', () => {
    const wasm = path.join(out, 'mediapipe/wasm/vision_wasm_internal.wasm');
    expect(statSync(wasm).size).toBeGreaterThan(100_000);
    expect(existsSync(path.join(out, 'mediapipe/wasm/vision_wasm_internal.js'))).toBe(true);
    const model = readFileSync(path.join(out, 'models/face_landmarker.task'));
    const manifest = JSON.parse(read('runtime-assets.json'));
    expect(createHash('sha256').update(model).digest('hex')).toBe(manifest.modelSha256);
    expect(model.length).toBeGreaterThan(1_000_000);
  });

  it('keeps the camera grant page free of the tracker and of any messaging', () => {
    const grantScripts = /src="\.\/assets\/(grant-camera-[^"]+\.js)"/.exec(read('grant-camera.html'))![1]!;
    const code = read(path.join('assets', grantScripts));
    expect(code).not.toMatch(/vision_wasm|FaceLandmarker|sendMessage|chrome\.runtime|locks/);
  });
});
