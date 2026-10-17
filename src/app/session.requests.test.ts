// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticipantRequestController } from '../features/participant-requests/controller';
import { createCareWorld, settle } from '../features/participant-requests/requests.test-support';
import { BROW, Harness } from './session.test-support';

// Each test starts a real PostgreSQL (PGlite); allow for a loaded machine running the full suite.
vi.setConfig({ testTimeout: 30_000 });

/** W1: the real session with the real request controller over the real SQL/RLS test backend. */
let close: (() => Promise<void>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

async function world(mode: 'gesture' | 'assisted' = 'gesture') {
  const care = await createCareWorld(); close = care.close;
  const owner = await care.caregiver('Ward A');
  const device = care.device();
  const send = vi.spyOn(device.client, 'sendRequest');
  let h: Harness | null = null;
  const controller = new ParticipantRequestController({ client: device.client, announce: (text) => h?.session.announceExternal(text) });
  h = new Harness({ requests: controller });
  if (mode === 'assisted') h.session.useAssisted(); else h.setUpToCommunication();
  expect(h.snap.stage).toBe('communication');
  const pair = async () => {
    const invite = await care.invite(owner, 'Alex');
    await device.client.pair(invite.token);
    await device.client.refresh();
    await settle();
    h!.run(1_000); // the rebuilt list needs fresh neutral before a movement acts
    return invite.participantId;
  };
  return { care, owner, device, send, controller, h, pair };
}

const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);

describe('caregiver requests in the communication session (W1)', () => {
  it('shows Ask only once paired, and one long hold on Water sends exactly one request', async () => {
    const { care, send, h, pair } = await world();
    expect(ids(h)).not.toContain('ask');
    await pair();
    expect(ids(h)).toContain('ask');
    expect(ids(h).indexOf('ask')).toBe(ids(h).indexOf('pause') + 1);
    expect(h.snap.announcement).toBe('Caregiver requests are ready. Starting from the main list.');
    h.selectByGesture('ask');
    expect(h.snap.level?.kind).toBe('ask');
    expect(ids(h)).toEqual(['request:water', 'request:bathroom', 'request:reposition', 'request:help', 'request:cancel', 'back', 'pause']);
    h.selectByGesture('request:water', BROW, 60_000, 5_000, 1_000);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await care.rows()).map((row) => row.kind)).toEqual(['water']);
    expect(h.snap.level?.kind).toBe('top');
  });

  it('never sends from Speak, composing, Practice or a paused helper click', async () => {
    const { send, h, pair } = await world();
    await pair();
    h.selectByGesture('phrase:g1:0');
    h.selectByGesture('speak');
    expect(h.spoken).toContain('Yes');
    h.session.selectTarget('pause');
    h.session.selectRequest('request:water');
    h.session.resume();
    h.reach('practice', (id) => h.session.selectTarget(id));
    h.session.selectTarget('practice');
    expect(h.snap.stage).toBe('practice');
    expect(ids(h)).not.toContain('ask');
    h.session.selectRequest('request:water');
    h.session.selectTarget('request:water');
    await settle();
    expect(send).not.toHaveBeenCalled();
  });

  it('a helper click on a request opens Ask and sends once; labels then follow the controller', async () => {
    const { send, controller, h, pair } = await world();
    await pair();
    h.session.selectRequest('request:help');
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    h.session.selectTarget('ask');
    const live = new Map(controller.view.targets.map((target) => [target.id, target.label]));
    for (const target of h.snap.scan!.targets.filter((entry) => entry.id.startsWith('request:'))) expect(target.label).toBe(live.get(target.id as never));
  });

  it.each(['assisted', 'gesture'] as const)('a revocation while paused keeps %s input paused; the next input only resumes (B1)', async (mode) => {
    const { care, owner, device, send, h, pair } = await world(mode);
    const participant = await pair();
    h.session.selectTarget('ask');
    h.session.selectTarget('pause');
    expect(h.snap.scan?.paused).toBe(true);
    await care.revoke(owner, participant);
    await device.client.refresh();
    await settle();
    expect(h.snap.scan?.paused).toBe(true);
    if (mode === 'assisted') h.session.switchPress(h.now); else { h.run(800, BROW); h.run(800); }
    expect(h.snap.scan?.paused).toBe(false);
    expect(h.snap.level?.kind).toBe('top');
    expect(ids(h)).not.toContain('ask');
    expect(h.snap.announcement).toBe('Resumed at the main list because caregiver requests changed.');
    expect(h.spoken).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('pairing while paused does not unpause; Resume starts at a main list that now has Ask (B1)', async () => {
    const { send, h, pair } = await world();
    h.session.selectTarget('pause');
    await pair();
    expect(h.snap.scan?.paused).toBe(true);
    expect(ids(h)).not.toContain('ask');
    h.run(800, BROW); h.run(800);
    expect(h.snap.scan?.paused).toBe(false);
    expect(ids(h)).toContain('ask');
    expect(h.spoken).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });
});
