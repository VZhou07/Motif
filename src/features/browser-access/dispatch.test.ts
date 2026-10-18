import { describe, expect, it } from 'vitest';
import { classifyTarget, dispatchTarget } from './dispatch';
import { BROWSER_TILES, COMMUNICATION_TILES, ToySession } from './toy-session';

describe('target classification', () => {
  it('sorts ids into browser, care and local', () => {
    for (const id of ['browse', 'browser:back', 'browser:return']) expect(classifyTarget(id)).toBe('browser');
    expect(classifyTarget('request:water')).toBe('care');
    for (const id of ['phrase:0', 'speak', 'pause']) expect(classifyTarget(id)).toBe('local');
  });
});

describe('one selection, one effect', () => {
  const calls = () => { const log: string[] = []; return { log, handlers: { browser: (id: string) => log.push(`browser:${id}`), care: (id: string) => log.push(`care:${id}`), local: (id: string) => log.push(`local:${id}`) } }; };

  it('every tile in both scopes causes at most one effect', () => {
    for (const scope of ['communication', 'browser'] as const) {
      for (const id of [...COMMUNICATION_TILES, ...BROWSER_TILES, 'request:help']) {
        const { log, handlers } = calls();
        dispatchTarget(id, scope, handlers);
        expect(log.length).toBeLessThanOrEqual(1);
      }
    }
  });
  it('a browser tile never reaches care and a care tile never reaches the browser', () => {
    for (const id of BROWSER_TILES) { const { log, handlers } = calls(); dispatchTarget(id, 'browser', handlers); expect(log.some((entry) => entry.startsWith('care:'))).toBe(false); }
    for (const id of COMMUNICATION_TILES) { const { log, handlers } = calls(); dispatchTarget(id, 'communication', handlers); expect(log.some((entry) => entry.startsWith('browser:') && id !== 'browse')).toBe(false); }
  });
  it('tiles outside the active scope are ignored', () => {
    const a = calls(); expect(dispatchTarget('request:water', 'browser', a.handlers)).toBe('ignored'); expect(a.log).toEqual([]);
    const b = calls(); expect(dispatchTarget('browser:scroll-down', 'communication', b.handlers)).toBe('ignored'); expect(b.log).toEqual([]);
    const c = calls(); expect(dispatchTarget('browse', 'browser', c.handlers)).toBe('ignored'); expect(c.log).toEqual([]);
  });
});

describe('Return and Pause reachability (stand-in session, scan steps = intervals)', () => {
  function stepsTo(scope: 'communication' | 'browser', id: string, start = 0): number {
    const session = new ToySession();
    session.setBrowserSink(() => {});
    if (scope === 'browser') session.enterBrowserScope();
    session.index = start;
    let steps = 0;
    while (session.highlighted() !== id) { session.advance(); steps += 1; if (steps > 20) throw new Error('unreachable'); }
    return steps;
  }
  it('Pause is the 4th tile and Return the 5th: reached after 3T and 4T from entry', () => {
    expect(stepsTo('browser', 'pause')).toBe(3);
    expect(stepsTo('browser', 'browser:return')).toBe(4);
  });
  it('from any position every tile is reached within 4 intervals (8 s at the 2 s default, plus dwell)', () => {
    for (let start = 0; start < BROWSER_TILES.length; start += 1) for (const id of BROWSER_TILES) expect(stepsTo('browser', id, start)).toBeLessThanOrEqual(4);
  });
  it('the browser list always has exactly the four commands plus Pause, in a fixed order, with no speed controls', () => {
    const session = new ToySession();
    session.setBrowserSink(() => {});
    session.enterBrowserScope();
    expect(session.tiles()).toEqual(['browser:scroll-down', 'browser:scroll-up', 'browser:back', 'pause', 'browser:return']);
    session.setPaused(true);
    session.frame('missing');
    expect(session.tiles()).toContain('browser:return');
  });
});
