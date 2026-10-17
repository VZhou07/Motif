import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GestureModel } from '../domain/types';
import type { SessionSnapshot } from '../app/types';
import { frameAt, Harness } from '../app/session.test-support';
import { CameraDiagnostics } from './CameraDiagnostics';

const brow: GestureModel = { id: 'brow', label: 'My eyebrow', feature: 'browOuterUpLeft', direction: 1,
  baselineCenter: 0.1, activationThreshold: 0.35, releaseThreshold: 0.15, activationMs: 250, releaseMs: 350 };
const mouth: GestureModel = { ...brow, id: 'mouth', label: 'My mouth', feature: 'jawOpen', activationThreshold: 0.45, releaseThreshold: 0.2 };

function trialSnapshot(): SessionSnapshot {
  const h = new Harness();
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  h.session.chooseMovement({ feature: 'browOuterUpLeft', direction: 1, label: 'My eyebrow' });
  h.step();
  return { ...h.snap, frame: frameAt(h.now, { browOuterUpLeft: 0.35 }), frameIntervalMs: 50 };
}

function panel() { return screen.getByRole('region', { name: 'Live camera diagnostics' }); }

describe('live camera diagnostics (R13)', () => {
  it('shows real selected measurements and explicitly has no thresholds before fitting', () => {
    const snapshot = trialSnapshot();
    render(<CameraDiagnostics snapshot={snapshot} />);
    const values = panel().textContent;
    expect(values).toContain('Tracking: tracked · 50 ms · 20.0 fps');
    expect(values).toContain('Live, smoothed0.350');
    expect(values).toContain('Resting baseline0.100');
    expect(values).toContain('Resting noise0.001');
    expect(values).toContain('Toward Action0.250');
    expect(values).toContain('Not learned yet');
    expect(values).toContain('Rest');
    expect(within(panel()).queryByText('Activate at')).toBeNull();
    expect(within(panel()).queryByText('Release within ±')).toBeNull();
  });

  it('shows the actual expected cross-check model instead of the latest trained movement', () => {
    const snapshot = trialSnapshot();
    if (!snapshot.capture) throw new Error('No capture');
    render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'verify', candidate: brow, setupModels: [mouth, brow],
      capture: { ...snapshot.capture, kind: 'verification', feature: 'jawOpen', direction: 1, modelId: 'mouth', movement: 'My mouth', prompt: 'Action' },
      frame: frameAt(12_000, { browOuterUpLeft: 0.8, jawOpen: 0.34 }),
    }} />);
    expect(panel().textContent).toContain('My mouth · increase');
    expect(panel().textContent).toContain('Mouth opening');
    expect(panel().textContent).toContain('Live, smoothed0.340');
    expect(panel().textContent).toContain('Toward Action0.240');
    expect(panel().textContent).toContain('Activate at0.450');
    expect(panel().textContent).toContain('Release within ±0.200');
    expect(panel().textContent).not.toContain('My eyebrow');
    expect(panel().textContent).toContain('No action is confirmed');
  });

  it('shows degrees and signed decreases from a frozen saved model baseline', () => {
    const snapshot = trialSnapshot();
    if (!snapshot.capture) throw new Error('No capture');
    const head: GestureModel = { ...brow, id: 'head', label: 'Head to my right', feature: 'headYaw', direction: -1,
      baselineCenter: 1.5, activationThreshold: 6, releaseThreshold: 2 };
    render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'verify', candidate: null, choice: null, setupModels: [head],
      capture: { ...snapshot.capture, kind: 'verification', feature: 'headYaw', direction: -1, modelId: 'head', movement: head.label },
      frame: frameAt(12_000, { headYaw: -7.5 }),
    }} />);
    expect(panel().textContent).toContain('Head to my right · decrease');
    expect(panel().textContent).toContain('Resting baseline1.50°');
    expect(panel().textContent).toContain('Toward Action9.00°');
    expect(panel().textContent).toContain('Activate at6.00°');
    expect(panel().textContent).toContain('Above activation');
    expect(panel().textContent).toContain('this reading alone does not confirm an action');
  });

  it.each([
    ['missing', 'No clear face is tracked'],
    ['multiple', 'More than one face is visible'],
    ['stale', 'Camera frames are too old'],
    ['invalid', 'A facial measurement was missing or invalid'],
  ] as const)('blanks old tracked readings and identifies the %s blocker', (tracking, reason) => {
    const snapshot = trialSnapshot();
    render(<CameraDiagnostics snapshot={{ ...snapshot, tracking }} />);
    // The latest frame is deliberately still tracked: snapshot safety state must win.
    expect(panel().textContent).toContain('Live, smoothed—');
    expect(panel().textContent).toContain('Toward Action—');
    expect(panel().textContent).toContain('frame rate unavailable');
    expect(panel().textContent).toContain(reason);
    expect(panel().textContent).not.toContain('Live, smoothed0.350');
  });

  it.each([
    { camera: 'off' as const, hidden: false, reason: 'Camera is off' },
    { camera: 'running' as const, hidden: true, reason: 'This tab is hidden' },
  ])('blanks readings when camera=$camera and hidden=$hidden', ({ camera, hidden, reason }) => {
    render(<CameraDiagnostics snapshot={{ ...trialSnapshot(), camera, hidden }} />);
    expect(panel().textContent).toContain('Live, smoothed—');
    expect(panel().textContent).toContain(reason);
  });

  it('retains historical failure values even when the live face has since relaxed', () => {
    const snapshot = trialSnapshot();
    render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'setup-failed', capture: null,
      frame: frameAt(50_000, { browOuterUpLeft: 0.101 }),
      failure: { kind: 'training', title: 'Could not learn', reasons: ['An attempt did not return to the personal resting baseline.'] },
      calibrationReport: { feature: 'browOuterUpLeft', direction: 1, baselineCenter: 0.1, noise: 0.001,
        weakestMovement: 0.4, restLimit: 0.1, restCeiling: 0.24, margin: 0.16, minimumMargin: 0.003,
        phases: [{ attempt: 1, phase: 'before', restDistance: 0.01 }, { attempt: 2, phase: 'after', restDistance: 0.24 }] },
    }} />);
    expect(panel().textContent).toContain('An attempt did not return to the personal resting baseline.');
    expect(panel().textContent).toContain('Live, smoothed0.101');
    expect(panel().textContent).toContain('Recorded measurements, not the live reading');
    expect(panel().textContent).toContain('Attempt 2 · Rest after Action: 0.240 / rest limit 0.100');
    expect(panel().textContent).toContain('Weakest Action: 0.400 · rest ceiling: 0.240');
    expect(panel().textContent).toContain('Separation: 0.160 · needed: 0.003');
    expect(panel().textContent).toContain('Not learned yet');
    expect(panel().textContent).not.toContain('Recording only.');
  });

  it('keeps frozen thresholds from diagnosticModel after candidate is cleared', () => {
    const snapshot = trialSnapshot();
    render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'setup-failed', capture: null, candidate: null,
      diagnosticModel: brow, setupModels: [],
      failure: { kind: 'verification', title: 'Check failed', reasons: ['The attempt must produce exactly one recognition of the intended movement.'] },
      cycles: [{ cycle: 1, movement: brow.label, training: { ok: true, reasons: [] }, heldOut: [{ attempt: 1, passed: false,
        eventCount: 0, validDurationMs: 15_000, expected: brow.label, expectedId: brow.id, kind: 'held-out',
        reasons: ['The attempt must produce exactly one recognition of the intended movement.'] }], negative: null,
        outcome: 'failed', source: 'trained', verifiedIds: [] }],
    }} />);
    expect(panel().textContent).toContain('Activate at0.350');
    expect(panel().textContent).toContain('My eyebrow');
  });

  it('shows actual held-out event counts and reasons after a failed check', () => {
    const snapshot = trialSnapshot();
    render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'setup-failed', capture: null, candidate: brow, setupModels: [brow],
      failure: { kind: 'verification', title: 'Check failed', reasons: ['The attempt must produce exactly one recognition of the intended movement.'] },
      cycles: [{ cycle: 1, movement: brow.label, training: { ok: true, reasons: [] }, heldOut: [{ attempt: 2, passed: false,
        eventCount: 0, validDurationMs: 15_000, expected: brow.label, expectedId: brow.id, kind: 'held-out',
        reasons: ['The attempt must produce exactly one recognition of the intended movement.'] }], negative: null,
        outcome: 'failed', source: 'trained', verifiedIds: [] }],
    }} />);
    expect(panel().textContent).toContain('Check 2: 0 recognition events; exactly 1 intended event is required.');
    expect(panel().textContent).toContain('The attempt must produce exactly one recognition of the intended movement.');
  });

  it('explains a below-threshold live signal and exposes actual recognition state without live chatter', () => {
    const snapshot = trialSnapshot();
    const view = render(<CameraDiagnostics snapshot={{ ...snapshot, stage: 'communication', capture: null, candidate: null,
      approvedModel: brow, approvedModels: [brow], setupModels: [brow],
      frame: frameAt(50_000, { browOuterUpLeft: 0.3 }), runtime: { phase: 'unarmed', armed: false, neutral: false },
    }} />);
    expect(panel().textContent).toContain('Below activation');
    expect(panel().textContent).toContain('Recognizer: Waiting for fresh rest');
    expect(view.container.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(panel().getAttribute('aria-live')).toBeNull();
  });
});
