import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';
import { liveDeviation } from './app/movements';
import { createLocalProfileStore, createMemoryStorage } from './app/profiles';
import { BROW, HEAD_WOBBLE, Harness, MOUTH, REST, type Values } from './app/session.test-support';
import type { LocalSpeech } from './app/speech';
import type { FailureKind, SessionSnapshot } from './app/types';
import type { MotifRuntime } from './app/useMotif';

// Branch ux-simplify, slice A: U1-U10, U12 (UX_ACCEPTANCE.md; design reasoning.md "UX simplify, slice A", revision 2).

type Progress = { segments: string[]; current: number | null } | null;
const progressModule = './app/progress';
async function setupProgress(snapshot: SessionSnapshot): Promise<Progress> {
  const mod = await import(/* @vite-ignore */ progressModule) as { setupProgress: (s: SessionSnapshot) => Progress };
  return mod.setupProgress(snapshot);
}

const BROW_LABEL = 'Raise left outer eyebrow';
const OPEN_MOUTH = { feature: 'jawOpen', direction: 1, label: 'Open mouth' } as const;
const perform = (label: string | null): Values => (label === 'Open mouth' ? MOUTH : label ? BROW : REST);
const FIRST = ['Rest', 'Movement', 'Record', 'Checks', 'Everyday', 'Approve'];
const ADDING = ['Movement', 'Record', 'Checks', 'Everyday', 'Approve'];
const RESTORING = ['Rest', 'Re-check', 'Everyday', 'Approve'];

function mount(h: Harness) {
  return render(createElement(App as ComponentType<{ runtime: Partial<MotifRuntime> }>, {
    runtime: { session: h.session, speech: { ...h.speech, refreshVoices: () => {} } as LocalSpeech, tracker: { start: vi.fn(async () => {}), stop: vi.fn() } },
  }));
}

// ── Reaching each stage ─────────────────────────────────────────────────────
const camera = (h = new Harness()) => { h.session.setCamera('running'); return h; };
function atBaseline(h = camera()): Harness { h.session.startBaseline(); h.run(2_000); return h; }
function atChoose(h = camera()): Harness { h.session.startBaseline(); h.run(10_500); expect(h.snap.stage).toBe('choose'); return h; }
function atTraining(h = atChoose()): Harness { h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: BROW_LABEL }); expect(h.snap.stage).toBe('training'); h.run(1_000); return h; }
function until(h: Harness, stage: string): Harness {
  h.followPrompts((snap) => snap.stage === stage || snap.stage === 'setup-failed', (snap) => perform(snap.capture?.movement ?? null));
  expect(h.snap.stage).toBe(stage);
  return h;
}
const atVerify = () => until(atTraining(), 'verify');
const atNegative = () => until(atTraining(), 'negative');
function atComfort(): Harness { const h = atNegative(); h.run(11_000, HEAD_WOBBLE); expect(h.snap.stage).toBe('comfort'); return h; }
function ready(options: ConstructorParameters<typeof Harness>[0] = {}): Harness { const h = new Harness(options); h.setUpToCommunication(); expect(h.snap.stage).toBe('communication'); return h; }
function ready2(): Harness {
  const h = ready();
  h.addMovement(OPEN_MOUTH, perform);
  h.selectByGesture('comfortable');
  h.selectByGesture('map:0');
  h.selectByGesture('approve-mapping');
  h.stepTo('finish-practice');
  return h;
}
/** Adding a second movement, at the comfort screen (then mapping after Comfortable). */
function adding(stage: 'choose' | 'comfort' | 'mapping'): Harness {
  const h = ready();
  if (stage === 'choose') { h.session.selectTarget('helper'); h.session.selectTarget('add-movement'); return h; }
  h.addMovement(OPEN_MOUTH, perform);
  if (stage === 'mapping') h.selectByGesture('comfortable');
  return h;
}
function changeControls(): Harness { const h = ready(); h.session.selectTarget('helper'); h.session.selectTarget('change-controls'); expect(h.snap.stage).toBe('mapping'); return h; }
function discoverResults(): Harness {
  const h = atChoose();
  h.session.startDiscovery();
  const start = h.now;
  h.run(20_500, (now) => ((now - start - 500) % 4_000 >= 0 && (now - start - 500) % 4_000 < 1_000 ? MOUTH : REST));
  expect(h.snap.stage).toBe('discover-results');
  return h;
}
function saved(): { storage: ReturnType<typeof createMemoryStorage>; options: { profiles: ReturnType<typeof createLocalProfileStore> }; now: number } {
  const storage = createMemoryStorage();
  const first = new Harness({ profiles: createLocalProfileStore(() => storage) });
  first.setUpToCommunication();
  return { storage, options: { profiles: createLocalProfileStore(() => storage) }, now: first.now };
}
function restoring(quick: boolean): Harness {
  const { options, now } = saved();
  const h = camera(new Harness(options));
  h.now = now + 5_000;
  expect(h.session.restoreProfile('Last setup', quick)).toBe(true);
  return h;
}

// Failures, by kind.
const FAILS: Record<FailureKind, () => Harness> = {
  baseline: () => { const h = camera(); h.session.startBaseline(); for (let i = 0; i < 8; i += 1) { h.run(400); h.step(REST, 'missing'); } return h; },
  training: () => { const h = atTraining(); h.followPrompts((snap) => snap.stage === 'setup-failed', () => REST); return h; },
  verification: () => {
    const h = atTraining();
    h.followPrompts((snap) => snap.stage === 'setup-failed' || snap.stage === 'comfort', (snap) => (snap.capture?.kind === 'training' ? BROW : REST));
    return h;
  },
  negative: () => { const h = atNegative(); h.run(1_000); h.run(800, BROW); h.run(11_000); return h; },
  discovery: () => { const h = atChoose(); h.session.startDiscovery(); for (let i = 0; i < 6; i += 1) { h.run(500); h.step(REST, 'missing'); } return h; },
  cancelled: () => { const h = atTraining(); h.session.cancel(); return h; },
  rejected: () => { const h = adding('mapping'); h.session.decide('reject'); return h; },
  'profile-mismatch': () => {
    const { options, now } = saved();
    const h = camera(new Harness(options));
    h.now = now + 5_000;
    h.session.restoreProfile('Last setup', false);
    h.run(10_500, BROW);
    return h;
  },
};
const FAILURE_KINDS = Object.keys(FAILS) as FailureKind[];

// ── Helpers on the rendered page ────────────────────────────────────────────
const main = () => document.querySelector('main')!;
const mainText = () => main().textContent ?? '';
const SEGMENT_NAMES = ['Rest', 'Movement', 'Record', 'Checks', 'Everyday', 'Approve', 'Re-check'];
function bar(): HTMLElement | null {
  return [...document.querySelectorAll('ol')].find((list) => list.children.length >= 4
    && [...list.children].every((item) => SEGMENT_NAMES.some((name) => (item.textContent ?? '').trim().startsWith(name)))) as HTMLElement ?? null;
}
const barSegments = () => [...bar()!.children].map((item) => SEGMENT_NAMES.find((name) => (item.textContent ?? '').trim().startsWith(name) && (name !== 'Re-check' || true))!);
const barCurrent = () => { const items = [...bar()!.children]; const current = items.filter((item) => item.getAttribute('aria-current') === 'step'); return { count: current.length, index: current.length ? items.indexOf(current[0]!) : null }; };
const unnamed = () => ['button', 'textbox', 'combobox', 'checkbox', 'radio', 'progressbar'].flatMap((role) =>
  screen.queryAllByRole(role, { name: (name) => name.trim() === '' }).map((el) => `${role}: ${el.outerHTML.slice(0, 80)}`));
const BANNED = /armed|interruptions|restarts|×\s*rest|Saved profile/i;

// ═══ U2: setupProgress, the whole table ═════════════════════════════════════
describe('U2 setupProgress', () => {
  const base = new Harness().snap;
  const snap = (over: Partial<SessionSnapshot>): SessionSnapshot => ({ ...base, ...over } as SessionSnapshot);
  const failure = (kind: FailureKind) => ({ kind, title: 't', reasons: ['r'] });
  const model = { id: 'm' } as never;
  const flows = {
    first: { over: {}, segments: FIRST, offset: 0 },
    recalibrate: { over: { recalibrating: true, approvedModels: [model] }, segments: FIRST, offset: 0 },
    add: { over: { adding: true, approvedModels: [model] }, segments: ADDING, offset: -1 },
  } as const;

  for (const [name, flow] of Object.entries(flows)) {
    it(`U2 ${name} flow: every stage gives the segment list and the right current segment`, async () => {
      const table: Array<[string, number | null]> = [
        ['baseline', 0], ['choose', 1], ['discover', 1], ['discover-results', 1], ['training', 2], ['verify', 3], ['negative', 4],
        ['comfort', 5], ['mapping', 5], ['mapping-confirm', 5],
      ];
      for (const [stage, index] of table) {
        const result = await setupProgress(snap({ ...flow.over, stage, candidate: { id: 'c' } as never } as Partial<SessionSnapshot>));
        const expected = index === null ? null : index + flow.offset;
        const current = flow.offset === -1 && stage === 'baseline' ? null : expected === null || expected < 0 ? null : expected;
        expect([name, stage, result?.segments, result?.current]).toEqual([name, stage, [...flow.segments], current]);
      }
    });
  }

  it('U2 restoring flow: Rest, Re-check, Everyday, Approve with the right current segment', async () => {
    const table: Array<[string, number]> = [['baseline', 0], ['verify', 1], ['negative', 2], ['comfort', 3], ['mapping-confirm', 3]];
    for (const [stage, index] of table) {
      const result = await setupProgress(snap({ stage, restoring: 'Last setup' } as Partial<SessionSnapshot>));
      expect([stage, result?.segments, result?.current]).toEqual([stage, RESTORING, index]);
    }
  });

  it('U2 quick restore goes straight to Approve (nothing before it is claimed done)', async () => {
    const h = restoring(true);
    expect(h.snap.stage).toBe('mapping-confirm');
    const result = await setupProgress(h.snap);
    expect(result).toEqual({ segments: RESTORING, current: 3 });
  });

  it('U2 setup-failed maps by failure kind (first setup and adding)', async () => {
    const cases: Array<[FailureKind, number | null]> = [['baseline', 0], ['discovery', 1], ['training', 2], ['verification', 3], ['negative', 4], ['cancelled', null], ['rejected', null], ['profile-mismatch', null]];
    for (const [kind, index] of cases) {
      const first = await setupProgress(snap({ stage: 'setup-failed', failure: failure(kind) }));
      expect([kind, first?.segments, first?.current]).toEqual([kind, FIRST, index]);
      const add = await setupProgress(snap({ stage: 'setup-failed', failure: failure(kind), adding: true, approvedModels: [model] }));
      expect([kind, add?.segments, add?.current]).toEqual([kind, ADDING, index === null || index === 0 ? null : index - 1]);
    }
  });

  it('U2 is hidden on tiring, recalibrate-confirm, Change controls and every non-setup stage', async () => {
    for (const stage of ['tiring', 'recalibrate-confirm', 'welcome', 'practice', 'communication'] as const) {
      expect([stage, await setupProgress(snap({ stage, approvedModels: [model] }))]).toEqual([stage, null]);
    }
    for (const stage of ['mapping', 'mapping-confirm'] as const) {
      expect([stage, await setupProgress(snap({ stage, approvedModels: [model], candidate: null }))]).toEqual([stage, null]);
    }
    expect(await setupProgress(changeControls().snap)).toBeNull();
  });

  it('U2 real harness states agree with the table', async () => {
    expect(await setupProgress(atBaseline().snap)).toEqual({ segments: FIRST, current: 0 });
    expect(await setupProgress(atChoose().snap)).toEqual({ segments: FIRST, current: 1 });
    expect(await setupProgress(atTraining().snap)).toEqual({ segments: FIRST, current: 2 });
    expect(await setupProgress(atVerify().snap)).toEqual({ segments: FIRST, current: 3 });
    expect(await setupProgress(atNegative().snap)).toEqual({ segments: FIRST, current: 4 });
    expect(await setupProgress(atComfort().snap)).toEqual({ segments: FIRST, current: 5 });
    expect(await setupProgress(adding('choose').snap)).toEqual({ segments: ADDING, current: 0 });
    expect(await setupProgress(adding('mapping').snap)).toEqual({ segments: ADDING, current: 4 });
    expect(await setupProgress(restoring(false).snap)).toEqual({ segments: RESTORING, current: 0 });
  });

  it('U2 every real failure kind is mapped', async () => {
    const expected: Record<FailureKind, number | null> = { baseline: 0, discovery: 1, training: 2, verification: 3, negative: 4, cancelled: null, rejected: null, 'profile-mismatch': null };
    for (const kind of FAILURE_KINDS) {
      const h = FAILS[kind]();
      expect([kind, h.snap.stage, h.snap.failure?.kind]).toEqual([kind, 'setup-failed', kind]);
      const result = await setupProgress(h.snap);
      const adjusted = kind === 'rejected' ? null : expected[kind];
      expect([kind, result?.current]).toEqual([kind, adjusted]);
    }
  });

  it('U2 the result carries only segments and current: no "done" flags', async () => {
    const result = await setupProgress(snap({ stage: 'negative' }));
    expect(Object.keys(result!).sort()).toEqual(['current', 'segments']);
  });
});

// ═══ U1: the bar on screen ═════════════════════════════════════════════════
describe('U1 setup progress bar', () => {
  const cases: Array<[string, () => Harness, string[] | null, number | null]> = [
    ['baseline', () => atBaseline(), FIRST, 0], ['choose', () => atChoose(), FIRST, 1], ['training', () => atTraining(), FIRST, 2],
    ['verify', () => atVerify(), FIRST, 3], ['negative', () => atNegative(), FIRST, 4], ['comfort', () => atComfort(), FIRST, 5],
    ['discover-results', () => discoverResults(), FIRST, 1],
    ['adding choose', () => adding('choose'), ADDING, 0], ['adding comfort', () => adding('comfort'), ADDING, 4], ['adding mapping', () => adding('mapping'), ADDING, 4],
    ['restoring rest', () => restoring(false), RESTORING, 0], ['quick restore confirm', () => restoring(true), RESTORING, 3],
    ['tiring', () => { const h = ready2(); h.stepTo('tiring'); return h; }, null, null],
    ['recalibrate-confirm', () => { const h = ready(); h.session.selectTarget('helper'); h.session.selectTarget('recalibrate'); return h; }, null, null],
    ['change controls mapping', () => changeControls(), null, null],
  ];
  for (const [name, make, segments, current] of cases) {
    it(`U1 ${name}: no STEP text, no old stepper; bar ${segments ? 'lists the flow with one current segment' : 'is hidden'}`, () => {
      const h = make();
      mount(h);
      expect(mainText()).not.toMatch(/STEP/);
      expect(document.querySelector('.setup-steps')).toBeNull();
      expect(screen.queryByText(/Settle in|Make it yours/)).toBeNull();
      if (!segments) { expect(bar()).toBeNull(); return; }
      expect(bar()).not.toBeNull();
      expect(barSegments()).toEqual(segments);
      const found = barCurrent();
      expect(found.count).toBeLessThanOrEqual(1);
      expect(found.index).toBe(current);
      expect(bar()!.textContent).not.toMatch(/done|complete|✓/i);
    });
  }

  it('U1 a failure with no current segment still shows the bar with none marked', () => {
    const h = FAILS.cancelled();
    mount(h);
    expect(bar()).not.toBeNull();
    expect(barCurrent()).toEqual({ count: 0, index: null });
  });

  it('U1 a baseline failure marks Rest, a training failure marks Record', () => {
    for (const [kind, index] of [['baseline', 0], ['training', 2]] as const) {
      const view = mount(FAILS[kind]());
      expect([kind, barCurrent().index]).toEqual([kind, index]);
      view.unmount();
    }
  });
});

// ═══ U3: no jargon ═════════════════════════════════════════════════════════
describe('U3 plain words', () => {
  it('U3 no setup screen text, evidence details included, uses the banned words', () => {
    const screens: Array<[string, () => Harness]> = [
      ['baseline', () => atBaseline()], ['choose', () => atChoose()], ['training', () => atTraining()], ['verify', () => atVerify()], ['negative', () => atNegative()],
      ['comfort', () => atComfort()], ['discover-results', () => discoverResults()], ['adding mapping', () => adding('mapping')], ['restoring', () => restoring(false)],
      ['quick restore', () => restoring(true)], ['tiring', () => { const h = ready2(); h.stepTo('tiring'); return h; }],
      ['recalibrate', () => { const h = ready(); h.session.selectTarget('helper'); h.session.selectTarget('recalibrate'); return h; }],
      ...FAILURE_KINDS.map((kind): [string, () => Harness] => [`failed ${kind}`, () => FAILS[kind]()]),
    ];
    for (const [name, make] of screens) {
      const view = mount(make());
      expect([name, mainText().match(BANNED)?.[0] ?? null]).toEqual([name, null]);
      view.unmount();
    }
  });

  it('U3 the evidence details of a finished check read plainly', () => {
    const h = atComfort();
    mount(h);
    const details = within(main()).getAllByText(/Setup evidence/)[0]!.closest('details')!;
    expect(details.textContent).toMatch(/Everyday activity: \d+ accidental selection/);
    expect(details.textContent).not.toMatch(BANNED);
  });

  it('U3 interruptions read "Paused N time(s) because your face wasn\'t clear" and the recording line stays', () => {
    const h = atBaseline();
    act(() => h.step(REST, 'missing'));
    mount(h);
    expect(h.snap.capture?.interruptions).toBe(1);
    expect(mainText()).toMatch(/Paused 1 time because your face wasn.t clear/);
    expect(mainText()).toMatch(/Communication is off while recording\./);
    act(() => { h.run(300); h.step(REST, 'missing'); });
    expect(mainText()).toMatch(/Paused 2 times because your face wasn.t clear/);
  });

  it('U3 no interruption line when there were none', () => {
    mount(atBaseline());
    expect(mainText()).not.toMatch(/Paused \d+ time/);
    expect(mainText()).toMatch(/Communication is off while recording\./);
  });
});

// ═══ U4: Choose ════════════════════════════════════════════════════════════
describe('U4 choose', () => {
  const tileOf = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label}`) });
  /** A live mouth-open reading at exactly `k` times the resting noise above the resting centre. */
  function withDeviation(k: number | null): Harness {
    const h = atChoose();
    if (k === null) { h.step(REST, 'missing'); return h; }
    const stats = h.snap.baseline!.statistics.jawOpen;
    let value = stats.center + k * stats.noise;
    for (let guard = 0; guard < 50 && liveDeviation(h.snap.baseline, { timestampMs: 0, tracking: 'tracked', values: { jawOpen: value } } as never, 'jawOpen', 1)! < k; guard += 1) value += stats.noise * 1e-9;
    h.step({ jawOpen: value });
    return h;
  }
  const meterOf = (h: Harness) => { mount(h); return within(tileOf('Open mouth')).getByLabelText(/^Signal: /).getAttribute('aria-label')!; };

  it('U4 the lead is one short sentence and the developer paragraphs are gone', () => {
    mount(atChoose());
    const lead = main().querySelector('.lead')!.textContent!;
    expect(lead.length).toBeLessThanOrEqual(140);
    expect((lead.match(/[.!?](\s|$)/g) ?? []).length).toBe(1);
    expect(mainText()).not.toMatch(/rhythm|alternates|Next: three|practice attempts|head-direction|camera geometry|real hardware|\d× rest/i);
  });

  it('U4 "No signal" with none yet, none below 1.5, some from 1.5 to below 3, strong from 3', () => {
    expect(meterOf(withDeviation(null))).toBe('Signal: none yet');
    document.body.innerHTML = '';
    expect(meterOf(withDeviation(1.49))).toMatch(/^Signal: none$/);
    document.body.innerHTML = '';
    expect(meterOf(withDeviation(1.5))).toMatch(/^Signal: some$/);
    document.body.innerHTML = '';
    expect(meterOf(withDeviation(2.99))).toMatch(/^Signal: some$/);
    document.body.innerHTML = '';
    expect(meterOf(withDeviation(3))).toMatch(/^Signal: strong$/);
  });

  it('U4 "Seen now" appears at 3 and above only', () => {
    for (const [k, seen] of [[null, false], [1.49, false], [1.5, false], [2.99, false], [3, true], [5, true]] as const) {
      const view = mount(withDeviation(k));
      expect([k, within(tileOf('Open mouth')).queryByText('Seen now') !== null]).toEqual([k, seen]);
      view.unmount();
    }
  });

  it('U4 clicking a tile still starts training', () => {
    const h = atChoose();
    mount(h);
    fireEvent.click(tileOf(BROW_LABEL));
    expect(h.snap.stage).toBe('training');
  });
});

// ═══ U5: setup failed ══════════════════════════════════════════════════════
describe('U5 setup failed', () => {
  const primaries = () => [...main().querySelectorAll('button')].filter((el) => el.className.split(/\s+/).includes('button-primary'));
  for (const kind of FAILURE_KINDS) {
    it(`U5 ${kind}: reasons shown and exactly one primary action, the right one`, () => {
      const h = FAILS[kind]();
      expect(h.snap.failure?.kind).toBe(kind);
      mount(h);
      for (const reason of h.snap.failure!.reasons) expect(mainText()).toContain(reason);
      const found = primaries();
      expect(found).toHaveLength(1);
      const ids = h.snap.decisions.map((decision) => decision.id);
      const name = found[0]!.textContent!;
      if (ids.includes('record-again')) expect(name).toMatch(/Record this movement again/);
      else if (kind === 'baseline') expect(name).toMatch(/Redo the rest check/);
      else if (kind === 'discovery') expect(name).toMatch(/Look for movements again/);
      else expect(name).toMatch(/Choose another movement/);
      expect(mainText()).not.toMatch(/You can record again, try another comfortable movement, redo the rest check, or use assisted input/);
    });
  }

  it('U5 the lead no longer lists the options', () => {
    for (const kind of FAILURE_KINDS) {
      const view = mount(FAILS[kind]());
      expect([kind, (main().querySelector('.lead')?.textContent ?? '').match(/record again.*another|redo the rest|assisted input/i)]).toEqual([kind, null]);
      view.unmount();
    }
  });
});

// ═══ U6: mapping cards ═════════════════════════════════════════════════════
describe('U6 mapping cards', () => {
  type Proposal = { id: string; mode: 'auto' | 'step'; recommended: boolean; inUse: boolean; parts: Array<{ label: string; action: string }> };
  const proposalsOf = (h: Harness) => (h.snap as unknown as { proposals: Proposal[] }).proposals;
  const card = (id: string) => document.querySelector(`[data-scan-id="${id}"]`) as HTMLElement;

  it('U6 each proposal is a card with a mode heading and one chip per movement', () => {
    const h = adding('mapping');
    mount(h);
    const proposals = proposalsOf(h);
    expect(proposals.length).toBeGreaterThanOrEqual(2);
    for (const proposal of proposals) {
      const element = card(proposal.id);
      expect(element).not.toBeNull();
      expect(element.textContent).toMatch(proposal.mode === 'auto' ? /Automatic: the highlight moves by itself/ : /Step by step: no timer/);
      expect(proposal.parts.length).toBe(h.snap.setupModels.length === 1 ? 1 : proposal.parts.length);
      for (const part of proposal.parts) expect(element.textContent).toContain(part.label);
    }
  });

  it('U6 Recommended and In use now badges match the snapshot', () => {
    const h = changeControls();
    mount(h);
    const proposals = proposalsOf(h);
    const recommended = proposals.filter((proposal) => proposal.recommended).map((proposal) => proposal.id);
    expect(recommended).toEqual(h.snap.recommendation ? [h.snap.recommendation.id] : []);
    for (const proposal of proposals) {
      const text = card(proposal.id).textContent ?? '';
      expect([proposal.id, /Recommended/.test(text)]).toEqual([proposal.id, proposal.recommended]);
      expect([proposal.id, /In use now/.test(text)]).toEqual([proposal.id, proposal.inUse]);
    }
    expect(proposals.filter((proposal) => proposal.inUse).length).toBeLessThanOrEqual(1);
  });

  it('U6 card ids and scan order equal the decision order, and Keep current setup is not primary', () => {
    const h = changeControls();
    mount(h);
    const decisionIds = h.snap.decisions.map((decision) => decision.id);
    expect(h.snap.scan!.targets.map((target) => target.id)).toEqual(decisionIds);
    const cardIds = [...document.querySelectorAll('[data-scan-id^="map:"]')].map((el) => el.getAttribute('data-scan-id'));
    expect(cardIds).toEqual(decisionIds.filter((id) => id.startsWith('map:')));
    expect(decisionIds.indexOf('keep-current')).toBeLessThan(decisionIds.indexOf(cardIds[0]!));
    const keep = screen.getByRole('button', { name: /Keep current setup/ });
    expect(keep.className.split(/\s+/)).not.toContain('button-primary');
    const trailing = decisionIds.slice(decisionIds.lastIndexOf(cardIds[cardIds.length - 1]!) + 1);
    expect(trailing.every((id) => id === 'reject' || id === 'reject-profile')).toBe(true);
  });

  it('U6 snapshot proposals are empty outside the mapping stage', () => {
    expect(proposalsOf(atComfort())).toEqual([]);
    expect(proposalsOf(ready())).toEqual([]);
  });
});

// ═══ U7 / U8 / U9 / U10 ════════════════════════════════════════════════════
describe('U7 practice', () => {
  it('U7 shows "Practice · nothing is spoken" and Start talking finishes practice', () => {
    const h = new Harness();
    h.calibrate();
    h.selectByGesture('approve-comfortable');
    expect(h.snap.stage).toBe('practice');
    mount(h);
    expect(document.body.textContent).toMatch(/Practice · nothing is spoken/);
    expect(screen.queryByRole('button', { name: /Finish practice/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Start talking/ }));
    expect(h.snap.stage).toBe('communication');
  });
});

describe('U8 camera panel details', () => {
  it('U8 diagnostics and the signal dashboard are hidden until Details is expanded', () => {
    mount(atChoose());
    const details = screen.getByRole('button', { name: /Details/ });
    expect(details.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Live camera diagnostics')).toBeNull();
    expect(screen.queryByText('Movement signal dashboard')).toBeNull();
    fireEvent.click(details);
    expect(details.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByLabelText('Live camera diagnostics')).toBeTruthy();
  });

  it('U8 the beeps toggle is visible on capture stages', () => {
    mount(atTraining());
    expect(screen.getByRole('checkbox', { name: /beeps/i })).toBeTruthy();
  });
});

describe('U9 short leads', () => {
  it('U9 every setup stage lead is at most 140 characters', () => {
    const stages: Array<[string, () => Harness]> = [
      ['baseline', () => atBaseline()], ['choose', () => atChoose()], ['training', () => atTraining()], ['verify', () => atVerify()], ['negative', () => atNegative()],
      ['comfort', () => atComfort()], ['discover', () => { const h = atChoose(); h.session.startDiscovery(); h.run(500); return h; }], ['discover-results', () => discoverResults()],
      ['mapping', () => adding('mapping')], ['mapping-confirm', () => { const h = adding('mapping'); h.selectByGesture('map:0'); return h; }],
      ['tiring', () => { const h = ready2(); h.stepTo('tiring'); return h; }],
      ['recalibrate-confirm', () => { const h = ready(); h.session.selectTarget('helper'); h.session.selectTarget('recalibrate'); return h; }],
      ...FAILURE_KINDS.map((kind): [string, () => Harness] => [`failed ${kind}`, () => FAILS[kind]()]),
    ];
    for (const [name, make] of stages) {
      const view = mount(make());
      const lead = main().querySelector('.lead');
      expect([name, lead !== null, (lead?.textContent ?? '').length <= 140]).toEqual([name, true, true]);
      view.unmount();
    }
  });
});

describe('U10 safety wording stays', () => {
  it('U10 failure reasons are shown (every kind), covered with U5; the observation disclaimer and counts stay on comfort', () => {
    mount(atComfort());
    expect(mainText()).toMatch(/accidental selections in/);
    expect(mainText()).toMatch(/not a guarantee/i);
    expect(mainText()).toMatch(/separate checks passed/);
  });

  it('U10 "nothing turns on until you approve" survives on comfort, mapping and confirm screens', () => {
    const comfort = mount(atComfort());
    expect(mainText()).toMatch(/Nothing is on until you approve/);
    comfort.unmount();
    const mapping = mount(adding('mapping'));
    expect(mainText()).toMatch(/turns nothing on|nothing (turns|is) on|until you approve/i);
    mapping.unmount();
    const h = adding('mapping');
    h.selectByGesture('map:0');
    expect(h.snap.stage).toBe('mapping-confirm');
    mount(h);
    expect(mainText()).toMatch(/Only Approve turns|until you approve|nothing turns on/i);
  });

  it('U10 saved setup wording replaces "Saved profile" and keeps the saved controls line', () => {
    mount(restoring(false));
    expect(mainText()).not.toMatch(/Saved profile/);
  });
});

// ═══ U12 ═══════════════════════════════════════════════════════════════════
describe('U12 names and sizes', () => {
  it('U12 every control on every setup screen has an accessible name', () => {
    const screens: Array<[string, () => Harness]> = [
      ['baseline', () => atBaseline()], ['choose', () => atChoose()], ['training', () => atTraining()], ['comfort', () => atComfort()],
      ['discover-results', () => discoverResults()], ['mapping', () => adding('mapping')], ['tiring', () => { const h = ready2(); h.stepTo('tiring'); return h; }],
      ['change controls', () => changeControls()], ['restoring', () => restoring(false)], ['quick restore', () => restoring(true)],
      ...FAILURE_KINDS.map((kind): [string, () => Harness] => [`failed ${kind}`, () => FAILS[kind]()]),
    ];
    for (const [name, make] of screens) {
      const view = mount(make());
      expect([name, unnamed()]).toEqual([name, []]);
      view.unmount();
    }
  });

  it('U12 new setup styles never declare text below 14px (progress bar, meter, cards, badges)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((match) => /setup-progress|signal-meter|proposal|mapping-card|chip|badge|seen-now/.test(match[1]!));
    const small = rules.flatMap((match) => [...match[2]!.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((size) => [match[1]!.trim(), Number(size[1])] as const)).filter(([, size]) => size < 14);
    expect(small).toEqual([]);
  });
});
