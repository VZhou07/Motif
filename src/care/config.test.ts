import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyCareConnectPolicy, parseCareConfig } from './config';

const origin = 'https://project123.supabase.co';
const key = 'sb_publishable_test_public_key_1234567890';
const configured = (url = origin, publishableKey = key) => ({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey });
function jwt(role: string) {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.test_signature`;
}

describe('explicit care configuration (R16)', () => {
  it('keeps networking off when both values are absent and refuses partial configuration', () => {
    expect(parseCareConfig({})).toEqual({ status: 'not-configured' });
    expect(parseCareConfig({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_PUBLISHABLE_KEY: '' })).toEqual({ status: 'not-configured' });
    expect(parseCareConfig({ VITE_SUPABASE_URL: origin }).status).toBe('invalid');
    expect(parseCareConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: key }).status).toBe('invalid');
    expect(parseCareConfig({ VITE_SUPABASE_URL: {}, VITE_SUPABASE_PUBLISHABLE_KEY: key }).status).toBe('invalid');
  });
  it('accepts a canonical hosted project and explicitly scoped local development origin', () => {
    expect(parseCareConfig(configured(`${origin}/`))).toEqual({ status: 'ready', config: { url: origin, publishableKey: key } });
    for (const url of ['http://localhost:54321', 'http://127.0.0.1:54321/']) expect(parseCareConfig(configured(url)).status).toBe('ready');
  });
  it.each([
    'http://project123.supabase.co', 'https://project123.supabase.co.evil.test', 'https://evil.supabase.co@evil.test',
    'https://sub.project123.supabase.co', 'https://supabase.co', 'https://project123.supabase.co:8443',
    'https://person:password@project123.supabase.co', `${origin}/rest/v1/`, `${origin}/?redirect=evil`, `${origin}/#value`,
    'https://PROJECT123.supabase.co', 'https://project123.supabase.co/../', 'https://127.0.0.1:54321',
    'http://localhost:5173', 'http://127.0.0.2:54321', 'http://192.168.1.2:54321', 'javascript:alert(1)',
  ])('refuses hostile, noncanonical or unapproved origin %s', (url) => {
    expect(parseCareConfig(configured(url)).status).toBe('invalid');
  });
  it('accepts only public API key forms and never repeats a rejected key', () => {
    expect(parseCareConfig(configured(origin, jwt('anon'))).status).toBe('ready');
    for (const rejected of ['sb_secret_private_test_value', jwt('service_role'), jwt('authenticated'), 'not-a-key', 'e30.invalid.signature']) {
      const result = parseCareConfig(configured(origin, rejected));
      expect(result.status).toBe('invalid');
      expect(JSON.stringify(result)).not.toContain(rejected);
    }
  });
});

describe('build/runtime care policy agreement', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  it('preserves offline defaults without valid configuration', () => {
    expect(applyCareConnectPolicy(html)).toBe(html);
    expect(applyCareConnectPolicy(html, { url: 'https://evil.test', publishableKey: key })).toBe(html);
  });
  it('adds exactly the configured HTTP origin without allowing websocket, model or script egress', () => {
    const result = parseCareConfig(configured());
    if (result.status !== 'ready') throw new Error('Fixture is invalid.');
    const transformed = applyCareConnectPolicy(html, result.config);
    const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(transformed)?.[1];
    expect(policy).toBe(`connect-src 'self' blob: data: ${origin}; img-src 'self' data: blob:`);
    expect(transformed).not.toContain(key);
    expect(transformed).not.toContain('wss:');
    expect(transformed).not.toContain('*.supabase.co');
    expect(transformed).not.toContain('script-src');
    expect(transformed.indexOf('Content-Security-Policy')).toBeLessThan(transformed.indexOf('<script'));
  });
  it('fails a configured build if the security meta or connection directive disappears', () => {
    const config = { url: origin, publishableKey: key };
    expect(() => applyCareConnectPolicy('<html></html>', config)).toThrow(/security policy is missing/);
    expect(() => applyCareConnectPolicy('<meta http-equiv="Content-Security-Policy" content="img-src self">', config)).toThrow(/security policy is missing/);
  });
});
