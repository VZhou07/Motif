import { describe, expect, it } from 'vitest';
import { classifyChromeError, describeOrigin, exactOrigin, normalizeAllowRequest, sameOrigin } from './origins';

describe('exact origin comparison', () => {
  it('compares scheme, host and port', () => {
    expect(sameOrigin('http://127.0.0.1:3000/a', 'http://127.0.0.1:3000/b?x=1')).toBe(true);
    expect(sameOrigin('http://127.0.0.1:3000/', 'http://127.0.0.1:4000/')).toBe(false);
    expect(sameOrigin('http://example.com/', 'https://example.com/')).toBe(false);
    expect(sameOrigin('https://en.wikipedia.org/', 'https://en.wikipedia.org.evil.example/')).toBe(false);
    expect(sameOrigin('https://en.wikipedia.org/', 'https://de.wikipedia.org/')).toBe(false);
  });
  it('treats a missing or non-web url as no origin', () => {
    for (const url of [undefined, null, '', 'chrome://settings', 'chrome-error://chromewebdata/', 'about:blank', 'file:///etc/hosts', 'https://user:pw@example.com/', 'not a url']) {
      expect(exactOrigin(url)).toBeNull();
      expect(sameOrigin(url, 'https://example.com')).toBe(false);
    }
  });
  it('does not equate two missing urls', () => expect(sameOrigin(undefined, undefined)).toBe(false));
  it('describes an origin for display', () => expect(describeOrigin('http://127.0.0.1:3000')).toBe('127.0.0.1:3000'));
});

describe('helper allow requests', () => {
  it('accepts an https site and reduces a pasted address to its origin', () => {
    expect(normalizeAllowRequest(' https://en.wikipedia.org/wiki/Cat?x=1 ')).toEqual({ ok: true, origin: 'https://en.wikipedia.org', pattern: 'https://en.wikipedia.org/*' });
    expect(normalizeAllowRequest('developer.mozilla.org')).toMatchObject({ ok: true, origin: 'https://developer.mozilla.org' });
  });
  it('accepts loopback http with its port only', () => {
    expect(normalizeAllowRequest('http://localhost:5173/')).toMatchObject({ ok: true, origin: 'http://localhost:5173', pattern: 'http://localhost:5173/*' });
    expect(normalizeAllowRequest('http://127.0.0.1/')).toMatchObject({ ok: true, origin: 'http://127.0.0.1' });
  });
  it.each([
    '', '   ', 'https://*.wikipedia.org', '*', 'http://example.com', 'ftp://example.com', 'file:///tmp/a', 'chrome://settings',
    'https://user:pw@example.com', 'https://chromewebstore.google.com/detail/x', 'https://accounts.google.com', 'https://intranet',
    'https://10.0.0.5', 'javascript:alert(1)', 'http://localhost.evil.example',
  ])('refuses %j', (value) => expect(normalizeAllowRequest(value).ok).toBe(false));
});

describe('chrome error classification', () => {
  it.each([
    ['Cannot find a next page in history.', 'no-history'],
    ['Frame with ID 0 was removed.', 'page-changed'],
    ['Frame with ID 0 is showing error page', 'unsupported-page'],
    ['Cannot access a chrome:// URL', 'unsupported-page'],
    ['Cannot access a chrome-error:// URL', 'unsupported-page'],
    ['The extensions gallery cannot be scripted.', 'unsupported-page'],
    ['Cannot access contents of the page. Extension manifest must request permission to access the respective host.', 'permission-missing'],
    ['No tab with id: 12.', 'tab-closed'],
    ['Something else entirely', 'execution-failed'],
  ])('%s -> %s', (message, code) => expect(classifyChromeError(message)).toBe(code));
});
