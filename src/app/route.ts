import { useSyncExternalStore } from 'react';

/** Which surface renders. A route grants no authority: the care backend decides what data an account sees. */
export type Route = 'participant' | 'caregiver';
export const CAREGIVER_HREF = '#/caregiver';
export const PARTICIPANT_HREF = '#/';

export function parseRoute(hash: string): Route {
  return /^#\/caregiver\/?$/.test(hash) ? 'caregiver' : 'participant';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parseRoute(window.location.hash), () => 'participant');
}
