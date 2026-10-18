import { KIND_NAMES, statusText } from './controller';
import type { ParticipantRequestController, RequestCard } from './controller';
import { useParticipantRequests } from './ParticipantRequestsPanel';

const OPEN: readonly RequestCard['status'][] = ['pending', 'failed', 'sent', 'acknowledged'];

/** On the board there is nothing to select, so a failed card points to where retry lives. */
function boardText(card: RequestCard, receiver: string | null): string {
  const text = statusText(card, receiver);
  return card.status === 'failed' ? text.replace('Select it to try again; this will not create a duplicate.', 'Open Ask caregiver to try again.') : text;
}

/**
 * Read-only request status on the main board (W2 Q4): the newest card whatever its status, plus the newest
 * other open card. Plain text, not a live region (the session already announces changes) and nothing to select.
 */
export function RequestStatusLine({ controller }: { controller: ParticipantRequestController }) {
  const view = useParticipantRequests(controller);
  if (view.identity.state !== 'participant' || !view.cards.length) return null;
  const [newest, ...rest] = view.cards;
  const open = rest.filter((card) => OPEN.includes(card.status));
  const shown = [newest!, ...open.slice(0, 1)];
  const hidden = open.length - (shown.length - 1);
  return (
    <div className="request-status-line">
      {shown.map((card) => <p key={card.id}><strong>{KIND_NAMES[card.kind]}:</strong> {boardText(card, view.identity.receiver)}</p>)}
      {hidden > 0 && <p className="helper-copy">+{hidden} more open — see Ask caregiver.</p>}
    </div>
  );
}
