import { useState, type ReactNode, type RefObject } from 'react';
import { FEATURE_DEFINITIONS } from '../domain/types';
import type { CueAudioStatus } from '../app/audio';
import type { SessionSnapshot } from '../app/types';
import { CameraDiagnostics } from './CameraDiagnostics';

export interface CameraPanelProps {
  snapshot: SessionSnapshot;
  videoRef: RefObject<HTMLVideoElement | null>;
  onStart: () => void;
  onStop: () => void;
  /** The start screen has its own Get started button; the panel's would duplicate it. */
  hideStart?: boolean;
  cueStatus?: CueAudioStatus;
  onCuesEnabled?: (enabled: boolean) => void;
  children?: ReactNode;
}

export function trackingLabel(snapshot: SessionSnapshot): string {
  const { camera, tracking, hidden } = snapshot;
  if (camera === 'loading') return 'Starting your camera';
  if (camera === 'off') return 'Camera is off';
  if (camera === 'error') return 'Camera needs attention';
  if (hidden) return 'Paused while this tab is hidden';
  if (tracking === 'multiple') return 'More than one face in view — controls wait';
  if (tracking === 'tracked') return 'One face in view';
  if (tracking === 'stale') return 'Waiting for fresh camera input';
  return 'Looking for a clear face';
}

const actionLabels = { select: 'Selects', next: 'Moves next', previous: 'Moves back', pause: 'Pauses or resumes' } as const;

/** What an approved movement does now; unmapped movements still make simultaneous input wait (R6 B3). */
export function actionLabel(snapshot: SessionSnapshot, id: string): string {
  if (snapshot.inputMode === 'assisted') return 'Not in use';
  const action = snapshot.mapping?.assignments[id];
  return action ? actionLabels[action] : 'Not used';
}

const runtimeLabels = { unarmed: 'waiting for rest', neutral: 'resting', armed: 'ready', pending: 'confirming movement', held: 'release to rest' } as const;

export function CameraPanel({ snapshot, videoRef, onStart, onStop, hideStart, cueStatus, onCuesEnabled, children }: CameraPanelProps) {
  const [open, setOpen] = useState(false);
  const running = snapshot.camera === 'running';
  const tracked = running && snapshot.tracking === 'tracked';
  const model = snapshot.approvedModel;
  const models = snapshot.approvedModels;
  return (
    <aside className="camera-sidebar" aria-label="Camera and movement feedback">
      <div className="camera-card">
        <div className="camera-card-header">
          <span className="eyebrow">YOUR CAMERA</span>
          <span className={`tracking-pill ${tracked ? 'tracking-good' : ''}`}><span />{running ? 'Live · local' : snapshot.camera === 'loading' ? 'Starting' : 'Off'}</span>
        </div>
        <div className={`camera-preview ${running ? 'camera-running' : ''}`}>
          <video ref={videoRef} muted playsInline aria-label="Mirrored local camera preview" />
          <div className="camera-placeholder" aria-hidden="true">
            <svg viewBox="0 0 160 160" fill="none"><path d="M80 21c-29 0-43 21-43 52 0 36 17 65 43 65s43-29 43-65c0-31-14-52-43-52Z" stroke="currentColor" strokeWidth="2" strokeDasharray="5 6" /><path d="M57 70h9m28 0h9M79 74l-3 18h8m-20 16c9 7 23 7 32 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
            <span>{snapshot.camera === 'loading' ? 'Getting things ready…' : 'A space for your movement'}</span>
          </div>
          {running && <span className="preview-caption">Mirrored preview · left and right mean your own sides</span>}
        </div>
        <CameraDiagnostics snapshot={snapshot} />
        <div className="camera-status"><span className={`status-dot ${tracked ? 'status-good' : ''}`} /><strong>{trackingLabel(snapshot)}</strong></div>
        <p className="camera-help">{running
          ? 'Keep only the calibrated person in view. When tracking is unclear, controls safely wait.'
          : 'Video is processed on this device. It is never uploaded or saved.'}</p>
        {snapshot.cameraMessage && <p className="camera-help">{snapshot.cameraMessage}</p>}
        <div className="camera-actions">
          {running
            ? <button type="button" className="button button-quiet" onClick={onStop}>Stop camera</button>
            : hideStart ? null : <button type="button" className="button button-quiet" disabled={snapshot.camera === 'loading'} onClick={onStart}>
                {snapshot.camera === 'loading' ? 'Starting camera…' : snapshot.camera === 'error' ? 'Retry camera' : 'Start camera'}</button>}
        </div>
        {onCuesEnabled && <label className="camera-help" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={cueStatus?.enabled ?? true}
            disabled={cueStatus?.available === false} onChange={(event) => onCuesEnabled(event.target.checked)} />
          Rest/Action beeps {cueStatus?.available === false ? '(unavailable in this browser)' : cueStatus?.ready ? '' : '(play after you start the camera)'}
        </label>}
        {children}
      </div>
      {model && (
        <div className="learned-controls">
          <h2>{models.length === 1 ? 'Your movement' : 'Your movements'}</h2>
          {models.map((approved) => (
            <div key={approved.id}><span>{approved.label}</span><strong>{actionLabel(snapshot, approved.id)}</strong></div>
          ))}
          {snapshot.runtime && <div><span>Recognizer</span><strong>{runtimeLabels[snapshot.runtime.phase]}</strong></div>}
        </div>
      )}
      <section className="signal-dashboard">
        <button type="button" className="dashboard-toggle" aria-expanded={open} aria-controls="signal-panel" onClick={() => setOpen(!open)}>
          <span>Movement signal dashboard</span><span aria-hidden="true">{open ? '−' : '+'}</span>
        </button>
        {open && (
          <div id="signal-panel">
            <p>Live smoothed measurements, not proof of intention. Left and right refer to the person's own face.{snapshot.baseline ? ' Numbers in brackets are deviation from your rest, in units of your resting variation.' : ''}</p>
            <dl>
              {FEATURE_DEFINITIONS.map(({ id, label, unit }) => {
                const value = snapshot.frame?.tracking === 'tracked' ? snapshot.frame.values[id] : undefined;
                const statistics = snapshot.baseline?.statistics[id];
                const deviation = typeof value === 'number' && statistics ? (value - statistics.center) / statistics.noise : null;
                return (
                  <div key={id}>
                    <dt>{label}</dt>
                    <dd>{typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(unit === 'degrees' ? 1 : 3)}${unit === 'degrees' ? '°' : ''}` : '—'}
                      {deviation !== null && Number.isFinite(deviation) ? ` (${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)})` : ''}</dd>
                  </div>
                );
              })}
            </dl>
            <p className="signal-footnote">Tracking: {snapshot.tracking}. Frame interval: {snapshot.frameIntervalMs ? `${Math.round(snapshot.frameIntervalMs)} ms` : '—'}.
              {snapshot.runtime ? ` Recognizer: ${runtimeLabels[snapshot.runtime.phase]}.` : ''}</p>
          </div>
        )}
      </section>
    </aside>
  );
}
