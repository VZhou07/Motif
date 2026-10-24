import { describe, expect, it } from 'vitest';
import type { BrowserCommand } from '../../care/browser-contract';
import { checkWindow, isKnownAction, isTabAction, parseCommand, parseWorkerMessage, REJECT_CODES, REJECT_TEXT, TAB_ACTIONS } from './protocol';

const good: BrowserCommand = { version: 1, id: 'abc', action: 'scroll-down', inputEpoch: 3, accessEpoch: 2, issuedAtMs: 1000, expiresAtMs: 1600 };

describe('command shape', () => {
  it('accepts a well-formed command', () => {
    expect(parseCommand(good)).toEqual({ ok: true, command: good });
  });
  it.each([
    [{ ...good, version: 2 }, 'bad-version'],
    [{ ...good, id: '' }, 'bad-id'],
    [{ ...good, id: 'x'.repeat(65) }, 'bad-id'],
    [{ ...good, id: 7 }, 'bad-id'],
    [{ ...good, action: 'click' }, 'unknown-action'],
    [{ ...good, action: 'constructor' }, 'unknown-action'],
    [{ ...good, action: '__proto__' }, 'unknown-action'],
    [{ ...good, action: 'toString' }, 'unknown-action'],
    [{ ...good, issuedAtMs: Number.NaN }, 'invalid-times'],
    [{ ...good, expiresAtMs: Infinity }, 'invalid-times'],
    [{ ...good, inputEpoch: '3' }, 'invalid-times'],
    [null, 'bad-message'],
    [[], 'bad-message'],
    ['scroll-down', 'bad-message'],
  ])('rejects %j as %s', (raw, reason) => {
    expect(parseCommand(raw)).toEqual({ ok: false, reason });
  });
  it('knows tab actions apart from return and ignores prototype keys', () => {
    expect(TAB_ACTIONS.every(isTabAction)).toBe(true);
    expect(isTabAction('return-to-communication')).toBe(false);
    expect(isKnownAction('return-to-communication')).toBe(true);
    expect(isKnownAction('hasOwnProperty')).toBe(false);
  });
});

describe('time window on the controller clock', () => {
  const at = (issuedAtMs: number, expiresAtMs: number): BrowserCommand => ({ ...good, issuedAtMs, expiresAtMs });
  it('accepts a live command', () => expect(checkWindow(at(1000, 1600), 1100)).toBeNull());
  it('rejects expiry at exactly now and later', () => {
    expect(checkWindow(at(1000, 1600), 1600)).toBe('expired');
    expect(checkWindow(at(1000, 1600), 5000)).toBe('expired');
  });
  it('rejects zero, negative and too long windows', () => {
    expect(checkWindow(at(1000, 1000), 1000)).toBe('invalid-times');
    expect(checkWindow(at(1000, 900), 1000)).toBe('invalid-times');
    expect(checkWindow(at(1000, 2001), 1000)).toBe('invalid-times');
    expect(checkWindow(at(1000, 2000), 1000)).toBeNull();
  });
  it('rejects a command issued in the future beyond the 50 ms skew', () => {
    expect(checkWindow(at(1051, 1500), 1000)).toBe('not-yet-valid');
    expect(checkWindow(at(1050, 1500), 1000)).toBeNull();
  });
});

describe('worker messages', () => {
  const base = { v: 1, panelId: 'p1' };
  it('parses bind, command and release', () => {
    const bind = { ...base, type: 'motif/bind', identityKey: 'local', accessEpoch: 0, tabId: 5, windowId: 1, origin: 'https://en.wikipedia.org' };
    expect(parseWorkerMessage(bind).ok).toBe(true);
    expect(parseWorkerMessage({ ...base, type: 'motif/command', command: good, ttlMs: 600 }).ok).toBe(true);
    expect(parseWorkerMessage({ ...base, type: 'motif/release' }).ok).toBe(true);
  });
  it('never lets return-to-communication reach the worker', () => {
    expect(parseWorkerMessage({ ...base, type: 'motif/command', command: { ...good, action: 'return-to-communication' }, ttlMs: 600 }))
      .toEqual({ ok: false, reason: 'unknown-action' });
  });
  it.each([
    [{ ...base, type: 'motif/command', command: good, ttlMs: 0 }, 'invalid-times'],
    [{ ...base, type: 'motif/command', command: good, ttlMs: 1001 }, 'invalid-times'],
    [{ ...base, type: 'motif/command', command: good, ttlMs: Number.NaN }, 'invalid-times'],
    [{ ...base, v: 2, type: 'motif/release' }, 'bad-version'],
    [{ type: 'motif/release' }, 'bad-message'],
    [{ ...base, type: 'motif/other' }, 'bad-message'],
    [{ ...base, type: 'motif/bind', identityKey: 'local', accessEpoch: 0, tabId: 1.5, windowId: 1, origin: 'https://a.example' }, 'bad-message'],
    [{ ...base, panelId: '' , type: 'motif/release' }, 'bad-message'],
  ])('rejects %j as %s', (raw, reason) => expect(parseWorkerMessage(raw)).toEqual({ ok: false, reason }));
});

describe('codes', () => {
  it('has user text for every code', () => {
    for (const code of REJECT_CODES) expect(REJECT_TEXT[code].length).toBeGreaterThan(10);
  });
});
