import type { CareClient } from '../../care/contracts';
import type { PortHost } from './port';

/** What a selected browser tile asks of the controller (matches the session hooks patch). */
export type BrowserRequest = 'browse' | 'scroll-up' | 'scroll-down' | 'back';
export type HostScope = 'communication' | 'browser';

/** The part of session state the controller reads. The real adapter maps MotifSession's snapshot onto this (chunk 8). */
export interface HostState {
  scope: HostScope;
  tracking: string;
  hidden: boolean;
  camera: string;
  paused: boolean;
  stage: string;
}

/** The hooks Agent 3's session patch provides. Nothing else of the session is touched. */
export interface BrowserHostSession {
  getHostState(): HostState;
  subscribe(listener: () => void): () => void;
  getInputEpoch(): number;
  onFailClosed(listener: () => void): () => void;
  setBrowserSink(sink: ((request: BrowserRequest) => void) | null): void;
  enterBrowserScope(): boolean;
  returnToCommunication(): boolean;
}

export type CareRole = 'signed-out' | 'unpaired' | 'caregiver' | 'participant' | 'revoked';
export interface IdentityState { epoch: number; role: CareRole; participantId: string | null; alias: string | null }

/** Read-only view of the shared care client. No credential ever passes through here. */
export interface CareIdentitySource {
  getIdentity(): IdentityState;
  subscribe(listener: () => void): () => void;
}

export function identityFromCare(client: Pick<CareClient, 'snapshot' | 'watch'>): CareIdentitySource {
  return {
    getIdentity() {
      const { epoch, access } = client.snapshot;
      return { epoch, role: access.role, participantId: access.participant?.id ?? null, alias: access.participant?.alias ?? null };
    },
    subscribe: (listener) => client.watch(() => listener()),
  };
}

/** `participant:<id>` or `local`; caregivers and revoked devices never get browser control. */
export function identityKey(identity: IdentityState): string {
  if (identity.role === 'participant' && identity.participantId) return `participant:${identity.participantId}`;
  if (identity.role === 'signed-out' || identity.role === 'unpaired') return 'local';
  return `blocked:${identity.role}`;
}
export const isBlocked = (identity: IdentityState): boolean => identityKey(identity).startsWith('blocked:');
/** Everything that must stay equal while a page is controlled. Epoch alone is not enough (poll failure wipes access without a bump). */
export const accessKey = (identity: IdentityState): string => `${identity.epoch}:${identity.role}:${identity.participantId ?? ''}`;

export function describeIdentity(identity: IdentityState): string {
  if (identity.role === 'participant') return identity.alias ? `Controlling for ${identity.alias}` : 'Controlling for the paired participant';
  if (identity.role === 'signed-out' || identity.role === 'unpaired') return 'This device, not paired';
  return 'Browser control is not available for this account';
}

/** Wires the port's view of the world to the session and care identity, read fresh on every use. */
export function createPortHost(session: BrowserHostSession, care: CareIdentitySource, now: () => number): PortHost {
  return {
    now,
    inputEpoch: () => session.getInputEpoch(),
    accessEpoch: () => care.getIdentity().epoch,
    identityKey: () => identityKey(care.getIdentity()),
    scope: () => session.getHostState().scope,
    returnToCommunication: () => session.returnToCommunication(),
  };
}
