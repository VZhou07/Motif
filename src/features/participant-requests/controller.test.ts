// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test starts a real PostgreSQL (PGlite); allow for a loaded machine running the full suite.
vi.setConfig({ testTimeout: 30_000 });
import { CareError } from '../../care';
import { ParticipantRequestController, reasonFor, statusText } from './controller';
import { createCareWorld, deferred } from './requests.test-support';

let close: (() => Promise<void>) | undefined;
// Polling is driven explicitly with refresh(); only the client's 2-second interval is faked.
beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
afterEach(async () => { await close?.(); close = undefined; vi.useRealTimers(); });

async function until(condition: () => boolean, ms = 15_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('Condition not reached in time.');
    await new Promise((done) => setTimeout(done, 5));
  }
}

async function setup(alias = 'Alex') {
  const world = await createCareWorld(); close = world.close;
  const owner = await world.caregiver('Ward A');
  const invite = await world.invite(owner, alias);
  const device = world.device();
  await device.client.pair(invite.token);
  const said: string[] = [];
  let n = 0;
  const controller = new ParticipantRequestController({ client: device.client, announce: (text) => said.push(text),
    newId: () => `aaaaaaaa-0000-4000-8000-${(++n).toString().padStart(12, '0')}` });
  controller.setActive(true);
  const sync = async () => { await device.client.refresh().catch(() => {}); };
  await sync();
  return { world, owner, invite, device, controller, said, sync };
}
const card = (controller: ParticipantRequestController, kind: string) => controller.view.cards.find((entry) => entry.kind === kind);

describe('sending (deliberate selection only)', () => {
  it('sends one request per selection and refuses a second open request of the same kind', async () => {
    const { world, controller, said } = await setup();
    expect(controller.view.identity).toMatchObject({ state: 'participant', alias: 'Alex', receiver: 'Ward A' });
    expect(controller.view.targets.map((target) => target.id)).toEqual(['request:water', 'request:bathroom', 'request:reposition', 'request:help', 'request:cancel']);
    expect(controller.activate('request:water')).toBe(true);
    expect(card(controller, 'water')?.status).toBe('pending');
    expect(said.at(-1)).toBe('Sending water request.');
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(said).toContain('Water request sent to Ward A.');
    expect(controller.view.targets[0]!.label).toBe('Water: sent, waiting');
    controller.activate('request:water');
    expect(said.at(-1)).toBe('Water is waiting for Ward A. Select Cancel to cancel it.');
    expect((await world.rows()).map((row) => row.kind)).toEqual(['water']);
  });

  it('blocks a repeat while the first send is still in flight', async () => {
    const { world, device, controller, said } = await setup();
    const gate = deferred();
    device.faults.hold = { name: 'motif_send_request', gate: gate.promise };
    const rpc = vi.spyOn(device.transport, 'rpc');
    controller.activate('request:water');
    controller.activate('request:water');
    controller.activate('request:water');
    expect(said.filter((text) => text === 'Still sending the water request.')).toHaveLength(2);
    gate.resolve();
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(rpc.mock.calls.filter(([name]) => name === 'motif_send_request')).toHaveLength(1);
    expect(await world.rows()).toHaveLength(1);
  });

  it('never sends for speech, composition, phrases or unknown ids, and not outside communication', async () => {
    const { device, controller, said } = await setup();
    const rpc = vi.spyOn(device.transport, 'rpc');
    for (const id of ['speak', 'clear', 'phrase:0', 'pause', 'recalibrate', 'practice']) expect(controller.activate(id)).toBe(false);
    expect(controller.activate('request:pizza')).toBe(true);
    controller.setActive(false);
    expect(controller.activate('request:water')).toBe(true);
    expect(controller.activate('request:cancel')).toBe(true);
    expect(rpc).not.toHaveBeenCalled();
    expect(said).toEqual([]);
    expect(controller.view.cards).toEqual([]);
  });

  it('helper Retry and Cancel do nothing outside communication', async () => {
    const { device, controller } = await setup();
    device.faults.failRpc = 'motif_send_request';
    controller.activate('request:help');
    await until(() => card(controller, 'help')?.status === 'failed');
    device.faults.failRpc = null;
    await device.client.refresh();
    const id = card(controller, 'help')!.id;
    const rpc = vi.spyOn(device.transport, 'rpc');
    controller.setActive(false);
    controller.retry(id);
    controller.cancel(id);
    expect(rpc).not.toHaveBeenCalled();
    expect(card(controller, 'help')?.status).toBe('failed');
  });

  it('Cancel waits while the chosen request is still sending', async () => {
    const { device, controller, said } = await setup();
    const gate = deferred();
    device.faults.hold = { name: 'motif_send_request', gate: gate.promise };
    const rpc = vi.spyOn(device.transport, 'rpc');
    controller.activate('request:water');
    controller.activate('request:cancel');
    expect(said.at(-1)).toBe('Wait until the water request finishes sending.');
    gate.resolve();
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(rpc.mock.calls.filter(([name]) => name === 'motif_transition_request')).toHaveLength(0);
  });

  it('fails closed without a request id generator', async () => {
    const { device, controller, said } = await setup();
    const broken = new ParticipantRequestController({ client: device.client, announce: (text) => said.push(text), newId: () => { throw new Error('no crypto'); } });
    broken.setActive(true);
    await until(() => broken.view.identity.state === 'participant');
    const rpc = vi.spyOn(device.transport, 'rpc');
    broken.activate('request:help');
    expect(rpc).not.toHaveBeenCalled();
    expect(said.at(-1)).toBe('This device cannot create a request ID. Nothing was sent.');
    broken.dispose(); controller.dispose();
  });
});

describe('truthful delivery state', () => {
  it('shows a dropped send as not confirmed, never Sent, and retries with the same id', async () => {
    const { world, device, controller, said, sync } = await setup();
    device.faults.failRpc = 'motif_send_request';
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'failed');
    const first = card(controller, 'water')!;
    expect(first.reason).toBe('the caregiver service could not be reached');
    expect(statusText(first, 'Ward A')).toMatch(/^Not confirmed — it may not have reached your caregiver/);
    expect(said.at(-1)).toMatch(/^Water request not confirmed/);
    expect(controller.view.targets[0]!.label).toBe('Water: not confirmed, select to try again');
    expect(await world.rows()).toEqual([]);
    device.faults.failRpc = null;
    await sync();
    controller.activate('request:water');
    expect(said.at(-1)).toBe('Trying the water request again.');
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(card(controller, 'water')!.id).toBe(first.id);
    expect((await world.rows()).map((row) => row.id)).toEqual([first.id]);
  });

  it('announces a second failure after a retry', async () => {
    const { device, controller, said, sync } = await setup();
    device.faults.failRpc = 'motif_send_request';
    controller.activate('request:help');
    await until(() => card(controller, 'help')?.status === 'failed');
    await sync();
    controller.activate('request:help');
    await until(() => card(controller, 'help')?.status === 'failed');
    expect(said.filter((text) => text.startsWith('General help request not confirmed'))).toHaveLength(2);
  });

  it('a send stored on the server whose reload failed shows not confirmed, then Sent, with one row', async () => {
    const { world, device, controller, sync } = await setup();
    device.faults.failListAfterSend = true;
    controller.activate('request:bathroom');
    await until(() => card(controller, 'bathroom')?.status === 'failed');
    expect(await world.rows()).toHaveLength(1);
    await sync();
    expect(card(controller, 'bathroom')?.status).toBe('sent');
    expect(controller.view.cards).toHaveLength(1);
    controller.activate('request:bathroom');
    expect(await world.rows()).toHaveLength(1);
  });

  it('shows caregiver acknowledgment and completion for this person, announced once each', async () => {
    const { world, owner, controller, said, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    const id = card(controller, 'water')!.id;
    await world.transition(owner, id, 'acknowledged');
    await sync(); await sync(); await sync();
    expect(card(controller, 'water')?.status).toBe('acknowledged');
    expect(controller.view.targets[0]!.label).toBe('Water: Ward A acknowledged');
    expect(said.filter((text) => text === 'Ward A acknowledged your water request.')).toHaveLength(1);
    await world.transition(owner, id, 'completed');
    await sync(); await sync();
    expect(card(controller, 'water')?.status).toBe('completed');
    expect(said.filter((text) => text === 'Your water request is done.')).toHaveLength(1);
    expect(controller.view.targets[0]!.label).toBe('Ask for water');
  });

  it('refuses to send while offline, keeps last-known state and the same targets', async () => {
    const { world, device, controller, said, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    const targets = controller.view.targets;
    const generation = controller.view.identityGeneration;
    device.faults.offline = true;
    await sync();
    expect(controller.view.connection).toBe('offline');
    expect(controller.view.targets).toBe(targets);
    expect(controller.view.identityGeneration).toBe(generation);
    expect(controller.view.identity).toMatchObject({ state: 'participant', alias: 'Alex', stale: true });
    expect(card(controller, 'water')).toMatchObject({ status: 'sent', stale: true });
    expect(statusText(card(controller, 'water')!, 'Ward A')).toMatch(/last known, not confirmed right now/);
    controller.activate('request:help');
    controller.activate('request:cancel');
    expect(said.slice(-2)).toEqual(["Can't reach the caregiver service right now. Nothing was sent.", "Can't reach the caregiver service right now. Nothing was cancelled."]);
    device.faults.offline = false;
    await sync();
    expect(controller.view.targets).toBe(targets);
    expect(controller.view.identityGeneration).toBe(generation);
    expect((await world.rows()).map((row) => row.status)).toEqual(['sent']);
  });

  it('orders cards by this device’s own sequence, not by possibly skewed timestamps', async () => {
    const { world, controller, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    controller.activate('request:bathroom');
    await until(() => card(controller, 'bathroom')?.status === 'sent');
    await world.db.query("update public.care_requests set created_at = now() + interval '1 hour' where kind = 'water'");
    await sync();
    expect(controller.view.cards.map((entry) => entry.kind)).toEqual(['bathroom', 'water']);
  });
});

describe('cancellation', () => {
  it('cancels the selected sent request, and an acknowledged one', async () => {
    const { world, owner, controller, said, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(controller.view.targets[4]!.label).toBe('Cancel water request');
    controller.activate('request:cancel');
    await until(() => card(controller, 'water')?.status === 'cancelled');
    expect(said).toContain('Water request cancelled.');
    controller.activate('request:reposition');
    await until(() => card(controller, 'reposition')?.status === 'sent');
    await world.transition(owner, card(controller, 'reposition')!.id, 'acknowledged');
    await sync();
    controller.activate('request:reposition');
    controller.activate('request:cancel');
    await until(() => card(controller, 'reposition')?.status === 'cancelled');
    expect((await world.rows()).map((row) => row.status)).toEqual(['cancelled', 'cancelled']);
  });

  it('never moves on to another request when the chosen one finished meanwhile', async () => {
    const { world, owner, controller, said, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    controller.activate('request:bathroom');
    await until(() => card(controller, 'bathroom')?.status === 'sent');
    expect(controller.view.targets[4]!.label).toBe('Cancel bathroom assistance request');
    // The caregiver completes the chosen request while the user is holding on Cancel.
    await world.transition(owner, card(controller, 'bathroom')!.id, 'acknowledged');
    await world.transition(owner, card(controller, 'bathroom')!.id, 'completed');
    await sync();
    controller.activate('request:cancel');
    expect(said.at(-1)).toBe('The bathroom assistance request is already done. Nothing was cancelled.');
    expect(controller.view.cancelSubject).toBeNull();
    controller.activate('request:cancel');
    expect(said.at(-1)).toBe('Select the request you want to cancel first, then Cancel.');
    await sync();
    expect(card(controller, 'water')?.status).toBe('sent');
  });

  it('reports a cancel race against the authoritative status', async () => {
    const { world, owner, controller, said } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    await world.transition(owner, card(controller, 'water')!.id, 'acknowledged');
    await world.transition(owner, card(controller, 'water')!.id, 'completed');
    controller.activate('request:cancel'); // still believes revision 1 / sent
    await until(() => said.some((text) => text.startsWith('The water request changed')));
    expect(said.at(-1)).toBe('The water request changed before it could be cancelled. It is now completed.');
    expect(card(controller, 'water')?.status).toBe('completed');
  });

  it('reports a cancel that failed without any change', async () => {
    const { device, controller, said } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    device.faults.failRpc = 'motif_transition_request';
    controller.activate('request:cancel');
    controller.activate('request:cancel');
    expect(said.at(-1)).toBe('Already cancelling the water request.');
    await until(() => said.some((text) => text.startsWith('Could not cancel')));
    expect(said.at(-1)).toBe('Could not cancel the water request: the caregiver service could not be reached. It is still sent.');
  });

  it('removes an unconfirmed request on Cancel and says it may still appear', async () => {
    const { world, device, controller, said } = await setup();
    device.faults.failRpc = 'motif_send_request';
    controller.activate('request:help');
    await until(() => card(controller, 'help')?.status === 'failed');
    controller.activate('request:cancel');
    expect(said.at(-1)).toBe('Removed the unconfirmed general help request. If it did reach your caregiver it will show here again.');
    expect(controller.view.cards).toEqual([]);
    expect(await world.rows()).toEqual([]);
  });
});

describe('identity and isolation', () => {
  it('never shows or cancels another participant’s request', async () => {
    const { world, owner, controller, sync } = await setup();
    const other = world.device();
    await other.client.pair((await world.invite(owner, 'Blake')).token);
    const foreign = '99999999-0000-4000-8000-000000000001';
    await other.client.sendRequest(foreign, 'water');
    await sync();
    expect(controller.view.cards).toEqual([]);
    controller.cancel(foreign);
    expect(controller.view.cancelSubject).toBeNull();
    expect((await world.rows())[0]!.status).toBe('sent');
  });

  it('clears everything on our own sign-out before the client has finished', async () => {
    const { device, controller } = await setup();
    device.faults.failRpc = 'motif_send_request';
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'failed');
    const signingOut = controller.signOut();
    expect(controller.view.targets).toEqual([]);
    expect(controller.view.cards).toEqual([]);
    await signingOut;
    expect(controller.view.identity.state).toBe('signed-out');
  });

  it('a direct switch to another person bumps the identity generation and ignores the old session’s late result', async () => {
    const { world, owner, device, controller, said, sync } = await setup();
    const other = world.device();
    await other.client.pair((await world.invite(owner, 'Blake')).token);
    const gate = deferred();
    device.faults.hold = { name: 'motif_send_request', gate: gate.promise };
    controller.activate('request:water');
    const generation = controller.view.identityGeneration;
    const before = said.length;
    device.adopt(other.credential()); // another tab re-paired the shared browser session
    gate.resolve();
    await until(() => controller.view.identity.alias === 'Blake');
    await sync();
    expect(controller.view.identityGeneration).toBeGreaterThan(generation);
    expect(controller.view.cards).toEqual([]);
    expect(controller.view.cancelSubject).toBeNull();
    expect(said.slice(before).some((text) => text.includes('not confirmed'))).toBe(false);
  });

  it('keeps the same person through a token refresh, then confirms a send that reached the server', async () => {
    const { world, device, controller, said } = await setup();
    const gate = deferred();
    device.faults.hold = { name: 'motif_send_request', gate: gate.promise };
    const rpc = vi.spyOn(device.transport, 'rpc');
    controller.activate('request:water');
    await until(() => rpc.mock.calls.some(([name]) => name === 'motif_send_request'));
    const targets = controller.view.targets;
    const generation = controller.view.identityGeneration;
    device.tokenRefresh();
    expect(device.client.snapshot.connection).toBe('loading');
    expect(controller.view.targets).toBe(targets);
    expect(controller.view.identity.state).toBe('participant');
    gate.resolve();
    await until(() => card(controller, 'water')?.status === 'sent');
    expect(controller.view.identityGeneration).toBe(generation);
    expect(await world.rows()).toHaveLength(1);
    expect(said.some((text) => text.includes('not confirmed'))).toBe(false);
  });

  it('a token refresh before the send reached the server leaves it not confirmed, announced once the person is confirmed', async () => {
    const { world, device, controller, said } = await setup();
    controller.activate('request:water');
    device.tokenRefresh(); // invalidates before the queued send starts
    const before = said.length;
    await until(() => card(controller, 'water')?.status === 'failed' && device.client.snapshot.connection === 'online');
    await until(() => said.length > before);
    expect(said.slice(before)).toEqual(['Water request not confirmed: the account changed during sending. It may not have reached your caregiver.']);
    expect(await world.rows()).toEqual([]);
    const id = card(controller, 'water')!.id;
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    expect((await world.rows()).map((row) => row.id)).toEqual([id]);
  });

  it('removes targets and cards when the caregiver revokes the pairing', async () => {
    const { world, owner, invite, controller, sync } = await setup();
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    await world.revoke(owner, invite.participantId);
    await sync();
    expect(controller.view.identity.state).toBe('revoked');
    expect(controller.view.targets).toEqual([]);
    expect(controller.view.cards).toEqual([]);
  });

  it('re-pairs a revoked device with a new invitation', async () => {
    const { world, owner, invite, controller, sync } = await setup();
    await world.revoke(owner, invite.participantId);
    await sync();
    expect(controller.view.identity.state).toBe('revoked');
    const fresh = await world.invite(owner, 'Alex again');
    expect(await controller.pair(fresh.token)).toBe(true);
    expect(controller.view.pairing.error).toBeNull();
    expect(controller.view.identity).toMatchObject({ state: 'participant', alias: 'Alex again', receiver: 'Ward A' });
    expect(controller.view.targets).toHaveLength(5);
    controller.activate('request:water');
    await until(() => card(controller, 'water')?.status === 'sent');
    expect((await world.rows()).map((row) => row.participant_id)).toEqual([fresh.participantId]);
  });

  it('a held send from a signed-out person never comes back after another person pairs', async () => {
    const { world, owner, device, controller, said } = await setup();
    const gate = deferred();
    device.faults.hold = { name: 'motif_send_request', gate: gate.promise };
    const rpc = vi.spyOn(device.transport, 'rpc');
    controller.activate('request:water');
    await until(() => rpc.mock.calls.some(([name]) => name === 'motif_send_request'));
    const signingOut = controller.signOut(); // clears now; the client signs out after the held send
    expect(controller.view.cards).toEqual([]);
    const before = said.length;
    gate.resolve(); // the old send is rejected only after this person was already cleared
    await signingOut;
    expect(controller.view.cards).toEqual([]);
    const next = await world.invite(owner, 'Blake');
    expect(await controller.pair(next.token)).toBe(true);
    await device.client.refresh();
    expect(controller.view.identity.alias).toBe('Blake');
    expect(controller.view.cards).toEqual([]);
    expect(said.slice(before).some((text) => /water/i.test(text))).toBe(false);
  });

  it('shows caregiver, not-configured and pairing states without request targets', async () => {
    const world = await createCareWorld(); close = world.close;
    const owner = await world.caregiver('Ward A');
    const device = world.device();
    device.signInCaregiver(owner);
    const controller = new ParticipantRequestController({ client: device.client });
    controller.setActive(true);
    await device.client.refresh();
    expect(controller.view.identity.state).toBe('caregiver');
    expect(controller.view.targets).toEqual([]);
    expect(await controller.pair('0'.repeat(64))).toBe(false);
    expect(controller.view.pairing.error).toBe('Signed in as a caregiver. Sign out before pairing.');
    const none = new ParticipantRequestController({ client: null });
    none.setActive(true);
    expect(none.view.identity.state).toBe('not-configured');
    expect(none.activate('request:water')).toBe(true);
    expect(none.view.targets).toEqual([]);
  });

  it('pairs through the controller and reports bad codes plainly, without echoing them', async () => {
    const world = await createCareWorld(); close = world.close;
    const owner = await world.caregiver('Ward A');
    const device = world.device();
    const controller = new ParticipantRequestController({ client: device.client });
    const bad = 'f'.repeat(64);
    expect(await controller.pair(bad)).toBe(false);
    expect(controller.view.pairing.error).toBe('That invitation code is not valid or has expired. Ask for a new one.');
    expect(JSON.stringify(controller.view)).not.toContain(bad);
    const { token } = await world.invite(owner, 'Alex');
    expect(await controller.pair(token)).toBe(true);
    expect(controller.view.identity).toMatchObject({ state: 'participant', alias: 'Alex', receiver: 'Ward A' });
    expect(controller.view.pairing.error).toBeNull();
    expect(controller.view.targets).toHaveLength(5);
    expect(await controller.pair(token)).toBe(false);
    expect(controller.view.pairing.error).toBe('This device is already paired.');
  });
});

describe('reasons', () => {
  it('maps errors to plain reasons', () => {
    expect(reasonFor(new TypeError('Failed to fetch'))).toBe('the caregiver service could not be reached');
    expect(reasonFor(new CareError('session_changed', 'x'))).toBe('the account changed during sending');
    expect(reasonFor(new CareError('request_failed', 'x'))).toBe('the service refused it');
    expect(reasonFor(new CareError('disposed', 'x'))).toBe('the request screen was closed');
    expect(reasonFor(new CareError('other', 'x'))).toBe('it could not be confirmed');
  });
});
