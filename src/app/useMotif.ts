import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { FaceTracker, TrackerError } from '../tracker';
import { createCueAudio, type CueAudio, type CueAudioStatus } from './audio';
import { createLocalProfileStore } from './profiles';
import { MotifSession } from './session';
import { createLocalSpeech, type LocalSpeech } from './speech';

/**
 * Tests inject fake adapters. The app's Root supplies one long-lived session and speech per page so
 * leaving for the caregiver route keeps unsaved setup; the real camera tracker is always built here.
 */
export interface MotifRuntime {
  session: MotifSession;
  tracker: Pick<FaceTracker, 'start' | 'stop'>;
  speech: LocalSpeech;
  cues?: CueAudio;
}
type Runtime = MotifRuntime;

function cueSnapshot(cues: CueAudio): CueAudioStatus {
  return cues.status();
}

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
  const [{ session, tracker, speech, cues }] = useState(() => {
    const speech = runtime?.speech ?? createLocalSpeech();
    const cues = runtime?.cues ?? createCueAudio();
    // Profiles live in this browser's storage and are written only by an explicit Save (R7).
    const profiles = createLocalProfileStore(() => window.localStorage);
    const session = runtime?.session ?? new MotifSession({ speech, profiles, cues });
    return { speech, cues, session, tracker: runtime?.tracker ?? new FaceTracker() };
  });
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  const [cueStatus, setCueStatus] = useState(() => cueSnapshot(cues));

  useEffect(() => {
    // Attach on every mount: StrictMode and route remounts rerun effects, not the initializer.
    session.setCueAudio(cues);
    const clock = window.setInterval(() => session.tick(performance.now()), 100);
    const visibility = () => session.setHidden(document.hidden, performance.now());
    const keydown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditable(event.target) || session.getSnapshot().inputMode !== 'assisted') return;
      event.preventDefault();
      session.switchPress(performance.now());
    };
    const unlock = () => { void cues.unlock().then(() => setCueStatus(cueSnapshot(cues))); };
    const synth = globalThis.speechSynthesis;
    const voices = () => { speech.refreshVoices(); session.refresh(); };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('keydown', keydown);
    window.addEventListener('pointerdown', unlock);
    synth?.addEventListener?.('voiceschanged', voices);
    visibility();
    voices();
    return () => {
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('pointerdown', unlock);
      synth?.removeEventListener?.('voiceschanged', voices);
      epochRef.current += 1;
      tracker.stop();
      // A kept session must not scan, speak or arm while its surface is gone.
      session.setHidden(true, performance.now());
      speech.cancel();
      cues.close();
      session.setCueAudio(null);
      session.setCamera('off');
    };
  }, [session, tracker, speech, cues]);

  // Epoch changes whenever the camera is stopped, errors, or the page unmounts; a start that
  // began under an older epoch must not report success or begin a rest check.
  const epochRef = useRef(0);
  const startingRef = useRef<Promise<boolean> | null>(null);
  const gettingStartedRef = useRef<Promise<boolean> | null>(null);

  const startCamera = useCallback((): Promise<boolean> => {
    if (startingRef.current) return startingRef.current;
    const video = videoRef.current;
    if (!video) return Promise.resolve(false);
    const epoch = epochRef.current;
    session.setCamera('loading');
    let run!: Promise<boolean>;
    run = (async (): Promise<boolean> => {
      try {
        await cues.unlock();
        setCueStatus(cueSnapshot(cues));
        await tracker.start(video, (frame) => session.ingest(frame, performance.now()), (error) => {
          epochRef.current += 1;
          session.setCamera('error', error.message);
        });
        if (epochRef.current !== epoch) {
          // Stopped, errored or unmounted while starting: do not leave a tracker running unseen.
          if (startingRef.current === run || startingRef.current === null) tracker.stop();
          return false;
        }
        session.setCamera('running');
        return true;
      } catch (error) {
        if (epochRef.current === epoch) {
          session.setCamera('error', error instanceof TrackerError ? error.message : 'The camera could not start. Retry or use assisted input.');
        }
        return false;
      } finally {
        if (startingRef.current === run) startingRef.current = null;
      }
    })();
    startingRef.current = run;
    return run;
  }, [session, tracker, cues]);

  /** One click: turn the camera on, then begin the rest check only if nothing changed meanwhile. */
  const getStarted = useCallback((): Promise<boolean> => {
    if (gettingStartedRef.current) return gettingStartedRef.current;
    const epoch = epochRef.current;
    let run!: Promise<boolean>;
    run = (async (): Promise<boolean> => {
      try {
        if (!(await startCamera())) return false;
        const now = session.getSnapshot();
        if (epochRef.current !== epoch || now.camera !== 'running' || now.stage !== 'welcome' || now.inputMode === 'assisted') return false;
        session.startBaseline();
        return true;
      } finally {
        if (gettingStartedRef.current === run) gettingStartedRef.current = null;
      }
    })();
    gettingStartedRef.current = run;
    return run;
  }, [session, startCamera]);

  const stopCamera = useCallback(() => {
    epochRef.current += 1;
    startingRef.current = null;
    gettingStartedRef.current = null;
    tracker.stop();
    session.setCamera('off');
  }, [session, tracker]);

  const setCuesEnabled = useCallback((enabled: boolean) => {
    cues.setEnabled(enabled);
    setCueStatus(cueSnapshot(cues));
  }, [cues]);

  return { snapshot, session, videoRef, startCamera, getStarted, stopCamera, cueStatus, setCuesEnabled };
}
