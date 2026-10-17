import type { ReactNode } from 'react';
import type { DecisionId } from '../app/session';
import type { SessionSnapshot } from '../app/types';

/** The id currently highlighted by the scanner, or undefined while suspended/paused. */
export function highlightedId(snapshot: SessionSnapshot): string | undefined {
  const scan = snapshot.scan;
  if (!scan || scan.suspended || scan.paused || scan.driver === 'none') return undefined;
  return scan.targets[scan.index]?.id;
}

export interface ScanButtonProps {
  id: string;
  snapshot: SessionSnapshot;
  onActivate: (id: string) => void;
  children: ReactNode;
  className?: string;
  primary?: boolean;
  disabled?: boolean;
  label?: string;
}

/** A large target that shows scan highlight and latch state; also clickable for caregivers. */
export function ScanButton({ id, snapshot, onActivate, children, className = '', primary = false, disabled = false, label }: ScanButtonProps) {
  const scanned = highlightedId(snapshot) === id;
  const latched = snapshot.scan?.latched === id;
  return (
    <button type="button" data-scan-id={id} aria-label={label} aria-current={scanned ? 'true' : undefined} disabled={disabled}
      className={`button ${primary ? 'button-primary' : ''} ${scanned ? 'is-scanned' : ''} ${latched ? 'is-latched' : ''} ${className}`}
      onClick={() => onActivate(id)}>
      {children}
    </button>
  );
}

export function ScanHint({ snapshot }: { snapshot: SessionSnapshot }) {
  const scan = snapshot.scan;
  let text = 'Choose with a click, touch or keyboard (assisted setup).';
  if (scan?.driver === 'gesture') {
    text = scan.suspended
      ? 'Scanning waits until one face is clearly in view. Nothing can be selected meanwhile.'
      : snapshot.runtime?.armed
        ? 'Your movement selects the highlighted choice. Buttons also work for a helper.'
        : 'Rest for a moment: your movement works again after a short rest.';
  } else if (scan?.driver === 'assisted') {
    text = 'Assisted input: press Space to select the highlighted choice.';
  }
  return <p className="control-hint">{text}</p>;
}

export function DecisionList({ snapshot, onDecide }: { snapshot: SessionSnapshot; onDecide: (id: DecisionId) => void }) {
  if (!snapshot.decisions.length) return null;
  return (
    <>
      <ScanHint snapshot={snapshot} />
      <div className="stacked-actions" role="group" aria-label="Choices">
        {snapshot.decisions.map((decision, index) => (
          <ScanButton key={decision.id} id={decision.id} snapshot={snapshot} primary={index === 0}
            onActivate={(id) => onDecide(id as DecisionId)}>{decision.label}</ScanButton>
        ))}
      </div>
    </>
  );
}
