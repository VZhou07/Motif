import { useSyncExternalStore } from 'react';
import type { SessionSnapshot } from '../../app/types';
import { highlightedId } from '../../components/ScanBoard';
import { KIND_NAMES, statusText } from './controller';
import type { ParticipantRequestController, ParticipantRequestsView, RequestCard } from './controller';
import './participant-requests.css';

export function useParticipantRequests(controller: ParticipantRequestController): ParticipantRequestsView {
  return useSyncExternalStore((listener) => controller.subscribe(listener), () => controller.view, () => controller.view);
}

export interface ParticipantRequestsPanelProps {
  controller: ParticipantRequestController;
  /** Session snapshot, used only to show the scan highlight on request targets. */
  snapshot?: SessionSnapshot;
  /** Helper clicks. The integrator passes `session.selectTarget` so clicks follow scanning rules. */
  onActivate?: (id: string) => void;
  /** True while paused or outside the communication screen. */
  disabled?: boolean;
}

const CONNECTION_TEXT = {
  offline: "Can't reach the caregiver service. Statuses may be out of date, and nothing is sent until it is back.",
  loading: 'Connecting to the caregiver service…',
  idle: 'Connecting to the caregiver service…',
} as const;

/**
 * The only renderer of request targets (design B5): labels are read live from the controller,
 * never from the session's scan-target copies. Speaking or composing a message never sends.
 */
export function ParticipantRequestsPanel({ controller, snapshot, onActivate, disabled = false }: ParticipantRequestsPanelProps) {
  const view = useParticipantRequests(controller);
  const activate = onActivate ?? ((id: string) => { controller.activate(id); });
  if (!view.targets.length) return null;
  const scanned = snapshot ? highlightedId(snapshot) : undefined;
  const latched = snapshot?.scan?.latched;
  const online = view.connection === 'online';
  return (
    <section className="settings-card request-panel" aria-label="Requests to your caregiver">
      <h2>Ask your caregiver</h2>
      <p>Requests from <strong>{view.identity.alias}</strong> go to <strong>{view.identity.receiver ?? 'your caregiver'}</strong>. Only choosing one of these sends anything; speaking or writing a message does not.</p>
      {!online && <p className="status-notice" role="status">{CONNECTION_TEXT[view.connection === 'none' || view.connection === 'online' ? 'offline' : view.connection]}</p>}
      <div className="phrase-grid request-targets" role="group" aria-label="Requests">
        {view.targets.map((target) => (
          <button key={target.id} type="button" data-scan-id={target.id} disabled={disabled}
            aria-current={scanned === target.id ? 'true' : undefined}
            className={`button phrase-tile ${scanned === target.id ? 'is-scanned' : ''} ${latched === target.id ? 'is-latched' : ''}`}
            onClick={() => activate(target.id)}>
            {target.label}
          </button>
        ))}
      </div>
      {view.cards.length > 0 && (
        <ul className="request-cards" aria-label="Your requests">
          {view.cards.map((card) => (
            <RequestCardRow key={card.id} card={card} receiver={view.identity.receiver} controller={controller}
              disabled={disabled || !online} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RequestCardRow({ card, receiver, controller, disabled }: { card: RequestCard; receiver: string | null; controller: ParticipantRequestController; disabled: boolean }) {
  const open = card.status === 'failed' || card.status === 'sent' || card.status === 'acknowledged';
  return (
    <li className={`request-card request-${card.status}`}>
      <div>
        <strong>{KIND_NAMES[card.kind]}</strong>
        <span>{statusText(card, receiver)}</span>
      </div>
      <div className="button-row">
        {card.status === 'failed' && (
          <button type="button" className="button" disabled={disabled} onClick={() => controller.retry(card.id)}>Retry</button>
        )}
        {open && (
          <button type="button" className="button button-quiet" disabled={disabled} onClick={() => controller.cancel(card.id)}
            aria-label={card.status === 'failed' ? `Remove this unconfirmed ${KIND_NAMES[card.kind].toLowerCase()} request` : `Cancel this ${KIND_NAMES[card.kind].toLowerCase()} request`}>
            {card.status === 'failed' ? 'Remove' : 'Cancel'}</button>
        )}
      </div>
    </li>
  );
}
