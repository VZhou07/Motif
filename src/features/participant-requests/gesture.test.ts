// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeatureFrame } from '../../domain/types';
import { makeFrame, stream, testModel } from '../../engine/fixtures.test-support';
import { GestureRuntime } from '../../engine/recognition';
import { ScanController } from '../../engine/scanner';
import { ParticipantRequestController } from './controller';
import { createCareWorld } from './test-support';

/**
 * Feature-level evidence: the real recognizer and real scanner select the controller's request
 * targets the way the session's driveScanner does. Real-session wiring is Agent 3's acceptance.
 */
let close: (() => Promise<void>) | undefined;
beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }); });
afterEach(async () => { await close?.(); close = undefined; vi.useRealTimers(); });

async function until(condition: () => boolean, ms = 4_000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > end) throw new Error('Condition not reached in time.');
    await new Promise((done) => setTimeout(done, 5));
  }
}

async function setup() {
  const world = await createCareWorld(); close = world.close;
  const owner = await world.caregiver('Ward A');
  const device = world.device();
  await device.client.pair((await world.invite(owner, 'Alex')).token);
  const controller = new ParticipantRequestController({ client: device.client });
  controller.setActive(true);
  await device.client.refresh();
  const ids = controller.view.targets.map((target) => target.id);
  const scanner = new ScanController(ids, 2_000, 1_000);
  const runtime = new GestureRuntime(testModel);
  const committed: string[] = [];
  /** The same steps as MotifSession.driveScanner for a select-mapped movement. */
  const drive = (frames: FeatureFrame[]) => {
    for (const frame of frames) {
      const now = frame.timestampMs;
      if (frame.tracking !== 'tracked') {
        runtime.invalidate();
        scanner.cancelSelection(now);
        scanner.setSuspended(true, now);
        continue;
      }
      scanner.setSuspended(false, now);
      const update = runtime.step(frame, now);
      if (update.started) scanner.beginSelection(now);
      if (update.cancelled && scanner.snapshot.latchedTarget !== undefined) scanner.cancelSelection(now);
      if (update.event) {
        const target = scanner.commitSelection(now);
        if (target) { committed.push(target); controller.activate(target); }
        continue;
      }
      scanner.tick(now);
    }
  };
  return { world, controller, scanner, drive, committed };
}
const brow = { browOuterUpLeft: 0.65 };

describe('request targets through real gesture scanning', () => {
  it('one long hold on Water creates exactly one request', async () => {
    const { world, controller, drive, committed } = await setup();
    drive(stream(1_000, 600));                 // rest: arms on fresh neutral
    drive(stream(1_650, 4_000, brow));         // a 4-second hold, longer than two scan steps
    drive(stream(5_700, 1_000));               // back to rest
    expect(committed).toEqual(['request:water']);
    await until(() => controller.view.cards[0]?.status === 'sent');
    expect((await world.rows()).map((row) => row.kind)).toEqual(['water']);
  });

  it('a dwell that spans a scan boundary selects the latched target', async () => {
    const { world, controller, drive, scanner, committed } = await setup();
    drive(stream(1_000, 1_850));               // rest until just before the 3 s boundary
    expect(scanner.snapshot.target).toBe('request:water');
    drive(stream(2_900, 600, brow));           // dwell begins at 2.9 s and completes after 3 s
    drive(stream(3_550, 1_000));
    expect(committed).toEqual(['request:water']);
    await until(() => controller.view.cards[0]?.status === 'sent');
    expect((await world.rows()).map((row) => row.kind)).toEqual(['water']);
  });

  it('tracking loss mid-dwell sends nothing, even if the hold continues', async () => {
    const { world, controller, drive, committed } = await setup();
    drive(stream(1_000, 600));
    drive(stream(1_650, 150, brow));           // dwell started, not complete
    drive([{ ...makeFrame(1_850, brow), tracking: 'missing' }]);
    drive(stream(1_900, 1_500, brow));         // still held: needs fresh neutral first
    expect(committed).toEqual([]);
    expect(controller.view.cards).toEqual([]);
    expect(await world.rows()).toEqual([]);
  });

  it('a switch press (Space path) reaches every request target in scan order', async () => {
    const { world, controller, scanner, committed } = await setup();
    for (let index = 0; index < 5; index++) {
      const now = 1_000 + index * 10;
      scanner.beginSelection(now);
      const target = scanner.commitSelection(now);
      if (target) { committed.push(target); controller.activate(target); }
      if (index < 4) await until(() => controller.view.cards.length === index + 1 && controller.view.cards[0]!.status === 'sent');
      scanner.move(1, now);
    }
    expect(committed).toEqual(['request:water', 'request:bathroom', 'request:reposition', 'request:help', 'request:cancel']);
    await until(() => controller.view.cards.find((card) => card.kind === 'help')?.status === 'cancelled');
    expect((await world.rows()).map((row) => `${row.kind}:${row.status}`).sort())
      .toEqual(['bathroom:sent', 'help:cancelled', 'reposition:sent', 'water:sent']);
  });
});
