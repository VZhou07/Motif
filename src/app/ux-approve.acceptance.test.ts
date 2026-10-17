import { render, screen } from '@testing-library/react';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';
import { createLocalProfileStore, createMemoryStorage } from './profiles';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './session.test-support';
import type { LocalSpeech } from './speech';
import type { MotifRuntime } from './useMotif';

// UX slice 2 acceptance rows 2.1-2.7 (UX_ACCEPTANCE.md): one approve screen for a first movement.

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label === BROW_LABEL ? BROW : REST);

/** Camera on, rest check, one movement chosen and verified: the first-movement comfort screen. */
function atComfort(h = new Harness()): Harness {
  h.calibrate();
  expect(h.snap.stage).toBe('comfort');
  return h;
}
/** Full first setup through the new approve screen, then finish practice. */
function setUpFirst(h: Harness): void {
  h.calibrate();
  h.selectByGesture('approve-comfortable');
  h.selectByGesture('finish-practice');
}
const ids = (h: Harness) => h.snap.decisions.map((decision) => decision.id);
const evidence = (h: Harness) => h.snap.evidence.find((item) => item.label === BROW_LABEL)!;

describe('2.1 one approve screen', () => {
  it('2.1 offers Approve and practice, Approve but it takes effort, Record again, Try another movement', () => {
    const h = atComfort();
    expect([...ids(h)].sort()).toEqual(['another-movement', 'approve-comfortable', 'approve-effort', 'record-again']);
    expect(h.snap.decisions.map((decision) => decision.label)).toEqual(
      expect.arrayContaining(['Approve and practice', 'Approve, but it takes effort']));
    expect(h.snap.decisions.map((decision) => decision.label).join('|')).toMatch(/Record.*again/);
    expect(h.snap.decisions.map((decision) => decision.label).join('|')).toMatch(/another movement/i);
  });

  it('2.1 mapping and mapping-confirm never appear on the way to practice', () => {
    const h = atComfort();
    const stages = new Set<string>();
    h.session.subscribe(() => stages.add(h.session.getSnapshot().stage));
    h.session.decide('approve-comfortable' as never);
    expect(h.snap.stage).toBe('practice');
    expect(stages.has('mapping')).toBe(false);
    expect(stages.has('mapping-confirm')).toBe(false);
  });
});

describe('2.2 approving', () => {
  it('2.2 Approve and practice approves the one movement (select only), cycle approved, effort easy', () => {
    const h = atComfort();
    h.session.decide('approve-comfortable' as never);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(Object.values(h.snap.mapping!.assignments)).toEqual(['select']);
    expect(h.snap.cycles.at(-1)!.outcome).toBe('approved');
    expect(evidence(h).effort).toBe('easy');
  });

  it('2.2 Approve, but it takes effort does the same and records effort', () => {
    const h = atComfort();
    h.session.decide('approve-effort' as never);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(Object.values(h.snap.mapping!.assignments)).toEqual(['select']);
    expect(h.snap.cycles.at(-1)!.outcome).toBe('approved');
    expect(evidence(h).effort).toBe('effort');
  });

  it('2.2 a repeated Approve after practice began is ignored', () => {
    const h = atComfort();
    h.session.decide('approve-comfortable' as never);
    const before = h.snap.approvedModels;
    h.session.decide('approve-comfortable' as never);
    h.session.decide('approve-effort' as never);
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toEqual(before);
    expect(evidence(h).effort).toBe('easy');
  });
});

describe('2.3 nothing is on before approval', () => {
  it('2.3 while the comfort screen shows nothing is approved or mapped', () => {
    const h = atComfort();
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.mappingLabel).toBeNull();
    expect(h.snap.pendingMapping).toBeNull();
    expect(h.snap.recommendation).toBeNull();
    expect(h.snap.cycles.at(-1)!.outcome).toBe('verified');
  });

  it('2.3 Record again and Try another movement approve nothing', () => {
    const again = atComfort();
    again.session.decide('record-again');
    expect(again.snap.approvedModels).toHaveLength(0);
    expect(again.snap.mapping).toBeNull();
    expect(again.snap.stage).not.toBe('practice');
    const other = atComfort();
    other.session.decide('another-movement');
    expect(other.snap.approvedModels).toHaveLength(0);
    expect(other.snap.mapping).toBeNull();
    expect(other.snap.stage).not.toBe('practice');
  });

  it('2.3 a first accidental movement on the comfort screen approves nothing (the scan starts on Record again)', () => {
    const h = atComfort();
    expect(h.highlightedId()).toBe('record-again');
    h.run(3_000, BROW);
    h.run(1_000, REST);
    expect(h.snap.stage).not.toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.practice.selections).toBe(0);
  });
});

describe('2.4 the screen says what turns on', () => {
  it('2.4 shows the control, automatic scanning, checks passed, accidental count and the not-a-guarantee note', () => {
    const h = atComfort();
    render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
      runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
    }));
    const text = document.body.textContent ?? '';
    expect(text).toMatch(new RegExp(`${BROW_LABEL} selects`));
    expect(text).toMatch(/automatic scanning/i);
    expect(text).toMatch(/separate checks passed/);
    expect(text).toMatch(/accidental selections/);
    expect(text).toMatch(/not a guarantee/);
    expect(screen.getByRole('button', { name: 'Approve and practice' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Approve, but it takes effort' })).toBeTruthy();
    expect(h.snap.comfortPreview).toEqual({ label: expect.stringContaining(`${BROW_LABEL} selects`), mode: 'auto' });
  });
});

describe('2.5 / 2.7 selection count with the gesture scanner', () => {
  it('2.5 one decision (the Approve) after the checks reaches practice, never the old comfortable/map/approve trio', () => {
    const h = new Harness();
    const decide = vi.spyOn(h.session, 'decide');
    const startBaseline = vi.spyOn(h.session, 'startBaseline');
    const choose = vi.spyOn(h.session, 'chooseMovement');
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: BROW_LABEL });
    h.followPrompts((snap) => snap.stage === 'negative', BROW);
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    h.selectByGesture('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    expect(decide.mock.calls.map((call) => call[0])).toEqual(['approve-comfortable']);
    // Get started + Record (chooseMovement) + Approve = 3 session calls; picking the movement tile is the 4th click (UI only).
    expect(startBaseline.mock.calls.length + choose.mock.calls.length + decide.mock.calls.length).toBe(3);
  });

  it('2.7 the Approve decisions are scan targets and one gesture selection approves', () => {
    const h = atComfort();
    const targets = h.snap.scan!.targets.map((target) => target.id);
    expect(targets).toEqual(expect.arrayContaining(['approve-comfortable', 'approve-effort']));
    expect(targets).not.toContain('comfortable');
    h.selectByGesture('approve-effort');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(1);
    expect(evidence(h).effort).toBe('effort');
  });
});

describe('2.9 preview equals the applied mapping, independent of effort', () => {
  it('2.9 the preview computed before the click equals the applied mapping for both Approve ids', () => {
    for (const id of ['approve-comfortable', 'approve-effort'] as const) {
      const h = atComfort();
      const preview = h.snap.comfortPreview;
      expect(preview).not.toBeNull();
      h.session.decide(id as never);
      expect(h.snap.stage).toBe('practice');
      expect(h.snap.mappingLabel).toBe(preview!.label);
      expect(h.snap.mapping!.mode).toBe(preview!.mode);
    }
  });

  it('2.9 the effort answer changes neither the preview nor the applied controls', () => {
    const easy = atComfort();
    const tired = atComfort();
    expect(tired.snap.comfortPreview).toEqual(easy.snap.comfortPreview);
    easy.session.decide('approve-comfortable' as never);
    tired.session.decide('approve-effort' as never);
    expect(tired.snap.mappingLabel).toBe(easy.snap.mappingLabel);
    expect(tired.snap.mapping).toEqual(easy.snap.mapping);
    expect(evidence(easy).effort).toBe('easy');
    expect(evidence(tired).effort).toBe('effort');
  });

  it('2.9 merely showing the comfort screen leaves proposals, recommendation and pending mapping untouched', () => {
    const h = atComfort();
    const first = h.snap.comfortPreview;
    h.run(1_000, REST);
    expect(h.snap.comfortPreview).toEqual(first);
    expect(h.snap.recommendation).toBeNull();
    expect(h.snap.pendingMapping).toBeNull();
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.mappingLabel).toBeNull();
    expect(h.snap.decisions.some((decision) => decision.id.startsWith('map:'))).toBe(false);
  });
});

describe('2.10 refusals are clean', () => {
  it('2.10 with no verified cycle (training, failed training) the approve ids are not offered and a call is ignored', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: BROW_LABEL });
    expect(ids(h)).not.toContain('approve-comfortable');
    h.session.decide('approve-comfortable' as never);
    h.session.decide('approve-effort' as never);
    expect(h.snap.stage).not.toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.pendingMapping).toBeNull();
    h.followPrompts((snap) => snap.stage === 'setup-failed' || snap.stage === 'comfort', REST);
    expect(h.snap.stage).toBe('setup-failed');
    expect(ids(h)).not.toContain('approve-comfortable');
    expect(ids(h)).not.toContain('approve-effort');
    h.session.decide('approve-effort' as never);
    expect(h.snap.stage).toBe('setup-failed');
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.pendingMapping).toBeNull();
    expect(h.snap.mapping).toBeNull();
    expect(h.snap.evidence.every((item) => item.effort === 'unknown')).toBe(true);
  });

  it('2.10 a refused approve records no effort and leaves pendingMapping null', () => {
    const h = atComfort();
    h.session.decide('record-again');
    h.session.decide('approve-effort' as never);
    expect(h.snap.pendingMapping).toBeNull();
    expect(h.snap.approvedModels).toHaveLength(0);
    expect(h.snap.evidence.find((item) => item.label === BROW_LABEL)?.effort ?? 'unknown').toBe('unknown');
  });

  it('2.10 a second approve after approval changes nothing', () => {
    const h = atComfort();
    h.session.decide('approve-effort' as never);
    const snapshot = JSON.stringify([h.snap.approvedModels, h.snap.mapping, evidence(h).effort]);
    h.session.decide('approve-comfortable' as never);
    expect(JSON.stringify([h.snap.approvedModels, h.snap.mapping, evidence(h).effort])).toBe(snapshot);
    expect(evidence(h).effort).toBe('effort');
  });
});

describe('2.11 other paths never offer the new ids', () => {
  const notNew = (h: Harness) => {
    expect(h.snap.stage).toBe('comfort');
    expect(ids(h)).toContain('comfortable');
    expect(ids(h)).not.toContain('approve-comfortable');
    expect(ids(h)).not.toContain('approve-effort');
    expect(h.snap.comfortPreview).toBeNull();
  };
  it('2.11 adding a movement', () => {
    const h = new Harness();
    setUpFirst(h);
    h.addMovement(OPEN_MOUTH, perform);
    notNew(h);
  });
  it('2.11 recalibrating', () => {
    const h = new Harness();
    setUpFirst(h);
    h.selectByGesture('recalibrate');
    h.selectByGesture('start-recalibration');
    h.run(10_500);
    h.selectByGesture('same-movement');
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.recalibrating).toBe(true);
    notNew(h);
  });
  it('2.11 re-checking a restored setup', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    setUpFirst(first);
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.session.setCamera('running');
    h.session.restoreProfile('Last setup', false);
    h.run(10_500);
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.restoring).toBe('Last setup');
    expect(h.snap.stage).toBe('comfort');
    expect(ids(h)).not.toContain('approve-comfortable');
    expect(ids(h)).not.toContain('approve-effort');
  });
});

describe('2.12 scan order and description', () => {
  it('2.12 Record again is scanned first, then the two Approves, then Try another movement', () => {
    const h = atComfort();
    const order = ['record-again', 'approve-comfortable', 'approve-effort', 'another-movement'];
    expect(ids(h)).toEqual(order);
    expect(h.snap.scan!.targets.map((target) => target.id).filter((id) => order.includes(id))).toEqual(order);
    expect(h.snap.scan!.targets[0]!.id).toBe('record-again');
  });

  it('2.12 the preview text sits in a region referenced by aria-describedby on the decision list', () => {
    const h = atComfort();
    render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
      runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
    }));
    const list = screen.getByRole('group', { name: 'Choices' });
    const described = list.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    const region = document.getElementById(described!.split(' ')[0]!);
    expect(region?.textContent).toContain(`${BROW_LABEL} selects`);
  });
});

describe('2.6 other paths keep their screens', () => {
  it('2.6 a second movement still goes comfort -> mapping -> confirm -> practice', () => {
    const h = new Harness();
    setUpFirst(h);
    h.addMovement(OPEN_MOUTH, perform);
    expect(h.snap.stage).toBe('comfort');
    expect(ids(h)).toEqual(expect.arrayContaining(['comfortable', 'comfortable-effort', 'record-again', 'another-movement']));
    expect(ids(h)).not.toContain('approve-comfortable');
    expect(ids(h)).not.toContain('approve-effort');
    expect(h.snap.comfortPreview).toBeNull();
    h.selectByGesture('comfortable');
    expect(h.snap.stage).toBe('mapping');
    h.selectByGesture('map:0');
    expect(h.snap.stage).toBe('mapping-confirm');
    h.selectByGesture('approve-mapping');
    expect(h.snap.stage).toBe('practice');
    expect(h.snap.approvedModels).toHaveLength(2);
  });

  it('2.6 re-checking a restored setup keeps its existing comfort decisions', () => {
    const storage = createMemoryStorage();
    const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
    setUpFirst(first);
    const h = new Harness({ profiles: createLocalProfileStore(() => storage) });
    h.session.setCamera('running');
    expect(h.session.restoreProfile('Last setup', false)).toBe(true);
    h.run(10_500);
    h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
    h.run(11_000, HEAD_WOBBLE);
    expect(h.snap.stage).toBe('comfort');
    expect(ids(h)).toEqual(['comfortable', 'another-movement', 'reject-profile']);
    expect(h.snap.comfortPreview).toBeNull();
  });

  it('2.6 the first-movement Approve ids are not offered outside the comfort stage', () => {
    const h = new Harness();
    setUpFirst(h);
    h.session.decide('approve-comfortable' as never);
    h.session.decide('approve-effort' as never);
    expect(h.snap.stage).toBe('communication');
    expect(h.snap.approvedModels).toHaveLength(1);
  });
});
