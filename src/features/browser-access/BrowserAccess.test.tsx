import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_COMMANDS, BrowserAccessProvider, BrowserControlsPanel, RuntimeNotice, SUGGESTED_SITES } from './BrowserAccess';
import type { BrowserController, ControllerState } from './controller';
import { REJECT_CODES, REJECT_TEXT } from './protocol';

function fakeController(initial: Partial<ControllerState> = {}) {
  let state: ControllerState = { phase: 'idle', origin: null, message: null, code: null, blocked: false, identity: 'Controlling for Alex', ...initial };
  const listeners = new Set<() => void>();
  const allowSite = vi.fn(async (value: string) => (value.startsWith('https://ok') ? { ok: true as const, origin: 'https://ok.example' } : { ok: false as const, message: 'Only https sites can be allowed.' }));
  const controller = {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    allowSite,
  } as unknown as BrowserController;
  return { controller, allowSite, set: (patch: Partial<ControllerState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); } };
}
const mount = (c: BrowserController, props: { mappingLabel?: string; grantCameraUrl?: string } = {}) =>
  render(<BrowserAccessProvider controller={c}><BrowserControlsPanel {...props} /></BrowserAccessProvider>);

describe('Browser controls card', () => {
  it('lists the four commands plus Pause in a fixed order with Return last, and the active mapping', () => {
    const { controller } = fakeController();
    mount(controller, { mappingLabel: 'Raise eyebrow selects (automatic scanning)' });
    const items = within(screen.getByRole('list', { name: 'Browser commands' })).getAllByRole('listitem').map((item) => item.firstElementChild!.textContent);
    expect(items).toEqual(['Scroll down', 'Scroll up', 'Back', 'Pause', 'Return to messages']);
    expect(BROWSER_COMMANDS.map((c) => c.label)).toEqual(items);
    expect(screen.getByText(/Raise eyebrow selects/)).toBeTruthy();
  });
  it('names who is controlled and what page, and announces messages politely', () => {
    const { controller, set } = fakeController({ phase: 'controlling', origin: 'https://en.wikipedia.org', message: 'Scrolled down.' });
    mount(controller);
    expect(screen.getByText('Controlling for Alex')).toBeTruthy();
    expect(screen.getByText('Controlling en.wikipedia.org')).toBeTruthy();
    const status = screen.getAllByRole('status').find((el) => el.textContent === 'Scrolled down.')!;
    expect(status.getAttribute('aria-live')).toBe('polite');
    act(() => set({ phase: 'idle', origin: null, code: 'tracking-lost', message: 'Tracking was lost, so browser control stopped. You are back on your messages.' }));
    expect(screen.getByText(/Tracking was lost/)).toBeTruthy();
    expect(screen.getByText('Not controlling a web page.')).toBeTruthy();
  });
  it('shows the plain explanation for every rejection code', () => {
    for (const code of REJECT_CODES) {
      const { controller } = fakeController({ message: REJECT_TEXT[code], code });
      const { unmount } = mount(controller);
      expect(screen.getAllByRole('status').some((el) => el.textContent === REJECT_TEXT[code]), code).toBe(true);
      unmount();
    }
  });
  it('replaces the controls for a caregiver or revoked account', () => {
    const { controller } = fakeController({ blocked: true, identity: 'Browser control is not available for this account' });
    mount(controller);
    expect(screen.queryByRole('list', { name: 'Browser commands' })).toBeNull();
    expect(screen.getAllByText(/not available for this account/).length).toBeGreaterThan(0);
  });
});

describe('helper-only site permission', () => {
  it('requests nothing while rendering, typing or picking a suggestion; only the Allow click asks', async () => {
    const { controller, allowSite } = fakeController();
    mount(controller);
    const user = userEvent.setup();
    await user.click(screen.getByText('Helper: allow a site'));
    await user.type(screen.getByLabelText('Site to allow'), 'https://ok.example');
    await user.click(screen.getByRole('button', { name: SUGGESTED_SITES[0].label }));
    expect(allowSite).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Site to allow') as HTMLInputElement).value).toBe(SUGGESTED_SITES[0].value);
    await user.click(screen.getByRole('button', { name: 'Allow this site' }));
    expect(allowSite).toHaveBeenCalledTimes(1);
    expect(allowSite).toHaveBeenCalledWith(SUGGESTED_SITES[0].value);
  });
  it('shows the validation message and the success message', async () => {
    const { controller } = fakeController();
    mount(controller);
    const user = userEvent.setup();
    await user.click(screen.getByText('Helper: allow a site'));
    await user.type(screen.getByLabelText('Site to allow'), 'http://nope.example');
    await user.click(screen.getByRole('button', { name: 'Allow this site' }));
    expect(await screen.findByText('Only https sites can be allowed.')).toBeTruthy();
    await user.clear(screen.getByLabelText('Site to allow'));
    await user.type(screen.getByLabelText('Site to allow'), 'https://ok.example');
    await user.click(screen.getByRole('button', { name: 'Allow this site' }));
    expect(await screen.findByText(/Allowed https:\/\/ok\.example/)).toBeTruthy();
  });
  it('links the camera permission page only when one is supplied', () => {
    const { controller } = fakeController();
    const { unmount } = mount(controller);
    expect(screen.queryByText('Open the camera permission page')).toBeNull();
    unmount();
    mount(controller, { grantCameraUrl: 'chrome-extension://x/grant-camera.html' });
    expect(screen.getByText('Open the camera permission page').getAttribute('href')).toBe('chrome-extension://x/grant-camera.html');
  });
});

describe('duplicate runtime notice', () => {
  it('is announced as an alert', () => {
    render(<RuntimeNotice />);
    expect(screen.getByRole('alert').textContent).toMatch(/already running in another window/);
  });
});

describe('compact stylesheet (about 400 px)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/features/browser-access/browser-access.css'), 'utf8');
  const luminance = (hex: string) => { const c = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
  const contrast = (a: string, b: string) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };
  it('declares no text under 12 px and no horizontal overflow traps', () => {
    expect([...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].filter((m) => Number(m[1]) < 12)).toEqual([]);
    expect(css).toContain('max-width:100%');
    expect(css).not.toMatch(/(?:^|[;{])\s*width:\s*\d{3,}px/);
  });
  it('keeps every control at least 44 px tall', () => {
    for (const selector of ['.ba-list li', '.ba-button', '.ba-helper input', '.ba-helper summary', '.ba-status']) {
      const block = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{[^}]*min-height:(\\d+)px`).exec(css);
      expect(Number(block?.[1]), selector).toBeGreaterThanOrEqual(44);
    }
  });
  it.each([
    ['#163e33', '#fffefa'], ['#355f4b', '#fffefa'], ['#1d5d45', '#fffefa'], ['#264d38', '#eaf0e3'], ['#4a6256', '#f6f7f2'], ['#4a6256', '#fffefa'],
    ['#ffffff', '#205e45'], ['#214c38', '#fdfefa'], ['#803d17', '#fff0e1'],
  ])('text %s on %s reaches 4.5:1', (text, background) => expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5));
});
