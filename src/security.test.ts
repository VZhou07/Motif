import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The second privacy layer (R10 revision 3): the page refuses outside connections even if the in-app guard were bypassed. */
describe('content security policy', () => {
  it('index.html restricts connections and images to this device', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const policy = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? '';
    expect(policy).toMatch(/connect-src 'self' blob: data:(;|$)/);
    expect(policy).toMatch(/img-src 'self' data: blob:(;|$)/);
    expect(html.indexOf('Content-Security-Policy')).toBeLessThan(html.indexOf('<script'));
  });
});
