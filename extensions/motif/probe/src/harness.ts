import { BrowserController } from '../../../../src/features/browser-access/controller';
import { createPortHost, type CareIdentitySource, type IdentityState } from '../../../../src/features/browser-access/host';
import { acquireRuntimeLock } from '../../../../src/features/browser-access/lock';
import { createBrowserCommandPort } from '../../../../src/features/browser-access/port';
import { ToySession } from '../../../../src/features/browser-access/toy-session';

// NOT the real session. It wires the real port, controller and worker to a stand-in scan list so a machine can drive the loop.
class ProbeCare implements CareIdentitySource {
  identity: IdentityState = { epoch: 1, role: 'participant', participantId: 'A', alias: 'Alex' };
  private readonly listeners = new Set<() => void>();
  getIdentity(): IdentityState { return { ...this.identity }; }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  set(patch: Partial<IdentityState>, bump = true): void { this.identity = { ...this.identity, ...patch, epoch: this.identity.epoch + (bump ? 1 : 0) }; this.listeners.forEach((l) => l()); }
}

const probe = window as unknown as { __probe?: unknown };
const tiles = document.getElementById('tiles')!;
const message = document.getElementById('message')!;
const identity = document.getElementById('identity')!;

const lock = await acquireRuntimeLock(navigator.locks);
if (!lock.held) {
  const notice = document.getElementById('notice')!;
  notice.hidden = false;
  notice.textContent = 'Motif is already running in another window.';
  probe.__probe = { lockHeld: false };
} else {
  const session = new ToySession();
  const care = new ProbeCare();
  const started = performance.now();
  void started;
  const port = createBrowserCommandPort(createPortHost(session, care, () => performance.now()), { send: (m) => chrome.runtime.sendMessage(m) });
  const careCalls: string[] = [];
  const controller = new BrowserController({ session, care, port, chrome, now: () => performance.now(), announce: (text) => { message.textContent = text; } });
  controller.start();
  const render = () => {
    tiles.replaceChildren(...session.tiles().map((id, index) => { const li = document.createElement('li'); li.textContent = id; if (index === session.index) li.setAttribute('aria-current', 'true'); return li; }));
    identity.textContent = controller.getState().identity;
  };
  session.subscribe(render);
  controller.subscribe(render);
  render();
  // The assisted Space switch: a stand-in for the gesture, never an accessibility claim.
  window.addEventListener('keydown', (event) => { if (event.code === 'Space' && !event.repeat) { event.preventDefault(); session.select({ care: (id) => careCalls.push(id) }); render(); } });
  document.getElementById('allow')!.addEventListener('click', () => { void controller.allowSite((document.getElementById('site') as HTMLInputElement).value).then((r) => { message.textContent = r.ok ? `Allowed ${r.origin}` : r.message; }); });
  probe.__probe = {
    lockHeld: true,
    session, care, port, controller, careCalls,
    pressSpace: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })),
    highlight: (id: string) => { session.highlight(id); render(); },
    snapshot: () => ({ scope: session.scope, effects: [...session.effects], binding: port.binding, state: controller.getState(), careCalls: [...careCalls], paused: session.paused }),
  };
}
