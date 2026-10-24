import { describe, expect, it } from 'vitest';
import { buildExtensionCsp, connectSources } from './csp';
import { buildManifest, GRANT_CAMERA_PAGE, SIDE_PANEL_PAGE } from './manifest';
import { applyCareConnectPolicy } from '../../care/config';

const care = { url: 'https://abcdefghij.supabase.co', publishableKey: 'sb_publishable_abcdefghijklmnop' };

describe('extension manifest', () => {
  const manifest = buildManifest();
  it('requests exactly the three required permissions and nothing broad', () => {
    expect(manifest.permissions).toEqual(['sidePanel', 'scripting', 'storage']);
    const text = JSON.stringify(manifest);
    for (const banned of ['<all_urls>', '"tabs"', 'activeTab', 'cookies', 'webRequest', 'debugger', 'nativeMessaging']) expect(text).not.toContain(banned);
    expect((manifest as unknown as Record<string, unknown>).host_permissions).toBeUndefined();
  });
  it('only declares optional hosts and has no web-facing entry points', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://127.0.0.1/*', 'http://localhost/*']);
    const keys = Object.keys(manifest);
    for (const key of ['content_scripts', 'externally_connectable', 'web_accessible_resources', 'commands', 'omnibox']) expect(keys).not.toContain(key);
  });
  it('names the toolbar action, side panel page and module worker', () => {
    expect(manifest.action.default_title).toBe('Motif');
    expect(manifest.side_panel.default_path).toBe(SIDE_PANEL_PAGE);
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.minimum_chrome_version).toBe('116');
    expect(GRANT_CAMERA_PAGE).not.toBe(SIDE_PANEL_PAGE);
  });
});

describe('extension content security policy', () => {
  it('allows wasm but not eval or remote scripts, with an explicit default-src', () => {
    const csp = buildExtensionCsp();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/script-src[^;]*(https?:|\*|unsafe-inline)/);
    expect(csp).toContain("object-src 'none'");
    expect(connectSources(csp)).toEqual(["'self'", 'blob:', 'data:']);
  });
  it('adds only the exact validated care origin', () => {
    expect(connectSources(buildExtensionCsp(care))).toEqual(["'self'", 'blob:', 'data:', 'https://abcdefghij.supabase.co']);
    expect(connectSources(buildExtensionCsp({ url: 'https://evil.example', publishableKey: care.publishableKey }))).toEqual(["'self'", 'blob:', 'data:']);
    expect(buildManifest(care).content_security_policy.extension_pages).toContain('https://abcdefghij.supabase.co');
  });
  it('agrees with the meta policy produced by applyCareConnectPolicy', () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="${buildExtensionCsp()}" />`;
    const rewritten = applyCareConnectPolicy(html, care);
    const content = /content="([^"]+)"/.exec(rewritten)![1]!;
    expect(connectSources(content)).toEqual(connectSources(buildExtensionCsp(care)));
    expect(content).toContain("script-src 'self' 'wasm-unsafe-eval'");
  });
});
