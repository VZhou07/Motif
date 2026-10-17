import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GestureModel } from '../domain/types';
import { frameAt, Harness, HEAD_WOBBLE, MOUTH } from '../app/session.test-support';
import type { SessionSnapshot } from '../app/types';
import { CameraDiagnostics } from './CameraDiagnostics';
import { CaptureView } from './SetupViews';

const MOUTH_LABEL = 'Open mouth';
const HEAD_LABEL = 'Tilt my head down';
const HEAD = { headPitch: 12 };

/** Genuine setup and recording, stopping while the person can prepare the changed movement. */
function preparingCrossCheck(): Harness {
  const h = new Harness();
  h.session.setCamera('running');
  h.session.startBaseline();
  h.run(10_500);
  h.session.chooseMovement({ feature: 'jawOpen', direction: 1, label: MOUTH_LABEL });
  h.followPrompts((snap) => snap.stage === 'negative' || snap.stage === 'setup-failed', MOUTH);
  expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('negative');
  h.run(11_000, HEAD_WOBBLE);
  h.selectByGesture('approve-comfortable', MOUTH);
  h.selectByGesture('finish-practice', MOUTH);
  h.session.selectTarget('add-movement');
  h.session.chooseMovement({ feature: 'headPitch', direction: 1, label: HEAD_LABEL });
  h.followPrompts((snap) => snap.stage === 'setup-failed'
    || (snap.stage === 'verify' && snap.capture?.index === 2 && snap.capture.prompt === 'Rest'
      && snap.capture.nextMovement === MOUTH_LABEL),
  (snap) => snap.capture?.movement === MOUTH_LABEL ? MOUTH : HEAD);
  expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('verify');
  return h;
}

function capturePanel(snapshot: SessionSnapshot, h: Harness) {
  return <><CaptureView snapshot={snapshot} session={h.session} /><CameraDiagnostics snapshot={snapshot} /></>;
}

describe('preparing the next calibration movement (R15)', () => {
  it('does not guess whether an unlearned signal is rest or action from a fixed number', () => {
    const h = new Harness();
    h.session.setCamera('running');
    h.session.startBaseline();
    h.run(10_500);
    h.session.chooseMovement({ feature: 'headPitch', direction: 1, label: HEAD_LABEL });
    h.step();
    const snapshot = { ...h.snap, frame: frameAt(h.now, { headPitch: 12 }) };
    const view = render(<CameraDiagnostics snapshot={snapshot} />);
    const panel = () => screen.getByRole('region', { name: 'Live camera diagnostics' });
    expect(panel().textContent).toContain('Live, smoothed12.00°');
    expect(panel().textContent).toContain('Recording only. Activation and release thresholds are not learned yet.');
    expect(panel().textContent).not.toMatch(/looks like Action|looks like rest/);
    view.rerender(<CameraDiagnostics snapshot={{ ...snapshot, frame: frameAt(h.now),
      capture: { ...snapshot.capture!, prompt: 'Action', nextMovement: null, nextModelId: null },
    }} />);
    expect(panel().textContent).toContain('Live, smoothed0.00°');
    expect(panel().textContent).toContain('Recording only. Activation and release thresholds are not learned yet.');
    expect(panel().textContent).not.toMatch(/looks like Action|looks like rest/);
  });

  it('shows the next cross-check during Rest and measures that movement, then names the same Action', () => {
    const h = preparingCrossCheck();
    const mouth = h.snap.approvedModels.find((model) => model.label === MOUTH_LABEL)!;
    const snapshot = { ...h.snap, frame: frameAt(h.now, { jawOpen: 0.23, headPitch: 11 }) };
    // The recorder still truthfully finishes the head attempt while the screen prepares mouth.
    expect([snapshot.capture?.movement, snapshot.capture?.modelId]).toEqual([HEAD_LABEL, snapshot.candidate?.id]);
    expect([snapshot.capture?.nextMovement, snapshot.capture?.nextModelId]).toEqual([MOUTH_LABEL, mouth.id]);
    const view = render(capturePanel(snapshot, h));
    expect(screen.getAllByText(/Next Action:/)).toHaveLength(2);
    expect(screen.queryByText(/Movement for this attempt:/)).toBeNull();
    const diagnostics = screen.getByRole('region', { name: 'Live camera diagnostics' });
    expect(diagnostics.textContent).toContain('Open mouth · increase');
    expect(diagnostics.textContent).toContain('Mouth opening');
    expect(diagnostics.textContent).toContain('Live, smoothed0.230');
    expect(diagnostics.textContent).not.toContain(HEAD_LABEL);
    expect(diagnostics.textContent).not.toContain('11.00°');
    expect(diagnostics.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();

    h.followPrompts((snap) => snap.stage === 'setup-failed'
      || (snap.capture?.index === 3 && snap.capture.prompt === 'Action'), HEAD);
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('verify');
    expect([h.snap.capture?.movement, h.snap.capture?.modelId]).toEqual([MOUTH_LABEL, mouth.id]);
    view.rerender(capturePanel(h.snap, h));
    expect(screen.queryByText(/Next Action:/)).toBeNull();
    expect(screen.getByText(/Movement for this attempt:/).textContent).toContain(MOUTH_LABEL);
  });

  it('does not announce another Action during the final recovery Rest', () => {
    const h = preparingCrossCheck();
    h.followPrompts((snap) => snap.stage === 'setup-failed'
      || (snap.capture?.index === 3 && snap.capture.prompt === 'Rest'),
    (snap) => snap.capture?.movement === MOUTH_LABEL ? MOUTH : HEAD);
    expect(h.snap.stage, h.snap.failure?.reasons.join(' ')).toBe('verify');
    expect([h.snap.capture?.nextMovement, h.snap.capture?.nextModelId, h.snap.capture?.nextPrompt]).toEqual([null, null, null]);
    render(capturePanel(h.snap, h));
    expect(screen.queryByText(/Next Action:/)).toBeNull();
    expect(screen.queryByText(/Next: Action/)).toBeNull();
  });

  it('calls input conflicting only when at least two movements meet activation', () => {
    const h = preparingCrossCheck();
    const mouth: GestureModel = { ...h.snap.approvedModels[0]!, activationThreshold: 0.4, releaseThreshold: 0.1 };
    const head: GestureModel = { ...h.snap.candidate!, activationThreshold: 8, releaseThreshold: 2 };
    const capture = { ...h.snap.capture!, prompt: 'Action' as const, modelId: head.id, feature: head.feature,
      direction: head.direction, movement: head.label, nextMovement: null, nextModelId: null };
    const snapshot = { ...h.snap, capture, setupModels: [mouth, head], approvedModels: [mouth], candidate: head };
    const view = render(<CameraDiagnostics snapshot={{ ...snapshot,
      frame: frameAt(h.now, { jawOpen: 0.35, headPitch: 5 }),
    }} />);
    const panel = () => screen.getByRole('region', { name: 'Live camera diagnostics' });
    expect(panel().textContent).toContain('Below activation');
    expect(panel().textContent).not.toMatch(/conflict/i);
    view.rerender(<CameraDiagnostics snapshot={{ ...snapshot,
      frame: frameAt(h.now, { jawOpen: mouth.baselineCenter + mouth.activationThreshold, headPitch: 8 }),
    }} />);
    expect(panel().textContent).toContain('Conflicting movements: “Open mouth” and “Tilt my head down”');
    expect(panel().textContent).toContain('No action is confirmed');
  });
});
