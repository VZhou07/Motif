// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createCareWorld } from './test-support';

let close: (() => Promise<void>) | undefined;
afterEach(async () => { await close?.(); close = undefined; });

describe('participant request test backend (real client over real SQL)', () => {
  it('pairs a device through an invitation and sends one idempotent request', async () => {
    const world = await createCareWorld(); close = world.close;
    const owner = await world.caregiver('Ward A');
    const { participantId, token } = await world.invite(owner, 'Alex');
    const device = world.device();
    const paired = await device.client.pair(token);
    expect(paired.access.role).toBe('participant');
    expect(paired.access.participant?.id).toBe(participantId);
    expect(paired.access.receiver_name).toBe('Ward A');
    const id = '11111111-1111-4111-8111-111111111111';
    const first = await device.client.sendRequest(id, 'water');
    const again = await device.client.sendRequest(id, 'water');
    expect(again).toEqual(first);
    expect((await world.rows()).map((row) => row.id)).toEqual([id]);
    expect(device.client.snapshot.requests.map((row) => row.id)).toEqual([id]);
  });

  it('keeps participants of one group apart', async () => {
    const world = await createCareWorld(); close = world.close;
    const owner = await world.caregiver('Ward A');
    const one = world.device(); const two = world.device();
    await one.client.pair((await world.invite(owner, 'A1')).token);
    await two.client.pair((await world.invite(owner, 'A2')).token);
    await one.client.sendRequest('22222222-2222-4222-8222-222222222222', 'help');
    await two.client.refresh();
    expect(two.client.snapshot.requests).toEqual([]);
    await expect(two.client.transitionRequest('22222222-2222-4222-8222-222222222222', 1, 'cancelled')).rejects.toThrow();
    expect((await world.rows())[0]!.status).toBe('sent');
  });

  it('rejects every call while offline', async () => {
    const world = await createCareWorld(); close = world.close;
    const owner = await world.caregiver('Ward A');
    const device = world.device();
    await device.client.pair((await world.invite(owner, 'Alex')).token);
    device.faults.offline = true;
    await expect(device.client.refresh()).rejects.toThrow();
    expect(device.client.snapshot.connection).toBe('offline');
  });
});
