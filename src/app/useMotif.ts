import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FaceTracker, TrackerError } from '../tracker';
import { createLocalProfileStore } from './profiles';
import { MotifSession } from './session';
import { createLocalSpeech, type LocalSpeech } from './speech';

/** Adapters are injectable for tests only; the app itself always builds the real camera tracker. */
export interface MotifRuntime { session: MotifSession; tracker: Pick<FaceTracker, 'start' | 'stop'>; speech: LocalSpeech }
type Runtime = MotifRuntime;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Connects the real camera tracker, local speech, tab visibility, the assisted Space
 * switch and the scan clock to one MotifSession. The app has no synthetic frame source.
 */
export function useMotif(runtime?: Partial<Runtime>) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [{ session, tracker, speech }] = useState<Runtime>(() => {
    const speech = runtime?.speech ?? createLocalSpeech();
    // Profiles live in this browser's storage and are written only by an explicit Save (R7).
    const profiles = createLocalProfileStore(() => window.localStorage);
    return { speech, session: runtime?.session ?? new MotifSession({ speech, profiles }), tracker: runtime?.tracker ?? new FaceTracker() };
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    const clock = window.setInterval(() => session.tick(performance.now()), 100);
    const visibility = () => session.setHidden(document.hidden, performance.now());
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditable(event.target) || session.getSnapshot().inputMode !== 'assisted') return;
      event.preventDefault();
      session.switchPress(performance.now());
    };
    const synth = globalThis.speechSynthesis;
    const voices = () => { speech.refreshVoices(); session.refresh(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', keydown);
    synth?.addEventListener?.('voiceschanged', voices);
    visibility();
    voices();
    return () => {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', keydown);
      synth?.removeEventListener?.('voiceschanged', voices);
      tracker.stop();
      session.setCamera('off');
    };
  }, [session, tracker, speech]);

  const startCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    session.setCamera('loading');
    try {
      await tracker.start(video, (frame) => session.ingest(frame, performance.now()), (error) => session.setCamera('error', error.message));
      session.setCamera('running');
    } catch (error) {
      session.setCamera('error', error instanceof TrackerError ? error.message : 'The camera could not start. Retry or use assisted input.');
    }
  }, [session, tracker]);

  const stopCamera = useCallback(() => {
    tracker.stop();
    session.setCamera('off');
  }, [session, tracker]);

  return { snapshot, session, videoRef, startCamera, stopCamera };
}
