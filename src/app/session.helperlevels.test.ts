import { describe, expect, it } from 'vitest';
import { Harness } from './session.test-support';

/** R18: Clear and Recalibrate ask inside the Helper levels; Say it again; derived panel flags. */
const ready = () => { const h = new Harness(); h.setUpToCommunication(); return h; };
const ids = (h: Harness) => h.snap.scan!.targets.map((target) => target.id);
const withMessage = (h: Harness) => { h.selectByGesture('group:g1'); h.selectByGesture('phrase:g1:0'); expect(h.snap.message).toEqual(['Yes']); };

describe('Clear level', () => {
  it('asks first with Keep it before Yes, and derives confirmingClear from the level', () => {
    const h = ready();
    withMessage(h);
    h.selectByGesture('clear');
    expect(h.snap.level?.kind).toBe('clear');
    expect(h.snap.confirmingClear).toBe(true);
    expect(h.snap.helperOpen).toBe(false);
    expect(ids(h)).toEqual(['clear-no', 'clear-yes', 'pause']);
    h.selectByGesture('clear-no');
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.confirmingClear).toBe(false);
    h.selectByGesture('clear');
    h.selectByGesture('clear-yes');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.level?.kind).toBe('top');
  });

  it('two idle wraps return to the main list with the message kept', () => {
    const h = ready();
    withMessage(h);
    h.selectByGesture('clear');
    h.run(2_000 * ids(h).length * 2 + 1_000);
    expect(h.snap.level?.kind).toBe('top');
    expect(h.snap.message).toEqual(['Yes']);
    expect(h.snap.announcement).toMatch(/Nothing changed/);
    expect(h.snap.announcement).not.toMatch(/Not saved/);
  });

  it('with an empty message Clear only announces', () => {
    const h = ready();
    h.selectByGesture('clear');
    expect(h.snap.level?.kind).toBe('more');
    expect(h.snap.announcement).toBe('Nothing to clear.');
  });
});

describe('Recalibrate level', () => {
  it('asks first; No returns to the Helper unchanged', () => {
    const h = ready();
    h.selectByGesture('recalibrate');
    expect(h.snap.level?.kind).toBe('recalibrate');
    expect(h.snap.confirmingRecalibrate).toBe(true);
    expect(ids(h)).toEqual(['recalibrate-no', 'recalibrate-yes', 'pause']);
    h.selectByGesture('recalibrate-no');
    expect(h.snap.level?.kind).toBe('more');
    expect(h.snap.helperOpen).toBe(true);
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.stage).toBe('communication');
  });

  it('Yes starts the rest check', () => {
    const h = ready();
    h.selectByGesture('recalibrate');
    h.selectByGesture('recalibrate-yes');
    expect(h.snap.stage).toBe('baseline');
    expect(h.snap.recalibrating).toBe(true);
    expect(h.snap.confirmingRecalibrate).toBe(false);
  });

  it('with the camera off Yes changes nothing and returns to the Helper level', () => {
    const h = ready();
    h.selectByGesture('recalibrate');
    h.session.setCamera('off');
    h.session.selectTarget('recalibrate-yes');
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.recalibrating).toBe(false);
    expect(h.snap.level?.kind).toBe('more');
    expect(h.snap.announcement).toMatch(/Start the camera first/);
  });

  it('auto-return changes nothing', () => {
    const h = ready();
    h.selectByGesture('recalibrate');
    h.run(2_000 * ids(h).length * 2 + 1_000);
    expect(h.snap.level?.kind).toBe('top');
    expect(h.snap.recalibrating).toBe(false);
  });
});

describe('Say it again, Speak and the Helper list', () => {
  it('Speak empties the message into lastSpoken and Say it again repeats exactly that, also after Clear', () => {
    const h = ready();
    withMessage(h);
    h.selectByGesture('speak');
    expect(h.snap.message).toEqual([]);
    expect(h.snap.lastSpoken).toBe('Yes');
    h.session.repeatLast();
    expect(h.spoken).toEqual(['Yes', 'Yes']);
    expect(h.snap.message).toEqual([]);
    h.selectByGesture('say-again');
    expect(h.spoken).toEqual(['Yes', 'Yes', 'Yes']);
  });

  it('repeatLast is refused with nothing spoken, and while paused', () => {
    const h = ready();
    h.session.repeatLast();
    expect(h.spoken).toEqual([]);
    withMessage(h);
    h.selectByGesture('speak');
    h.selectByGesture('pause');
    h.session.repeatLast();
    expect(h.spoken).toEqual(['Yes']);
  });

  it('the top list is the same with an empty or non-empty message', () => {
    const h = ready();
    const before = ids(h);
    expect(before.slice(0, 2)).toEqual(['speak', 'undo']);
    withMessage(h);
    expect(ids(h)).toEqual(before);
  });

  it('the Helper list has no tiring, ends with Close helper and Pause, and the tile reads Helper', () => {
    const h = ready();
    expect(h.snap.scan!.targets.find((target) => target.id === 'more')?.label).toBe('Helper');
    h.selectByGesture('more');
    expect(ids(h)).toEqual(['clear', 'save-favourite', 'say-again', 'slower', 'faster', 'change-controls', 'add-movement', 'recalibrate', 'back', 'pause']);
    expect(h.snap.scan!.targets.find((target) => target.id === 'back')?.label).toBe('Close helper');
    expect(h.snap.helperOpen).toBe(true);
  });
});
