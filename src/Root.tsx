import { useRef, useState } from 'react';
import App from './App';
import { sharedCareClient, type CareState } from './app/care';
import { createLocalProfileStore } from './app/profiles';
import { PARTICIPANT_HREF, useRoute } from './app/route';
import { MotifSession } from './app/session';
import { createLocalSpeech } from './app/speech';
import type { MotifRuntime } from './app/useMotif';
import { BrandMark, Icon } from './components/Icon';
import { CaregiverDashboard } from './features/caregiver';

export interface RootProps {
  /** Tests only: fake tracker/speech/session for the participant surface. */
  runtime?: Partial<MotifRuntime>;
  /** Tests only: a care client over a test transport, or a configuration state. */
  care?: CareState;
}

function participantRuntime(): Partial<MotifRuntime> {
  const speech = createLocalSpeech();
  // Profiles live in this browser's storage and are written only by an explicit Save (R7).
  const session = new MotifSession({ speech, profiles: createLocalProfileStore(() => window.localStorage) });
  return { session, speech };
}

/** Role-aware surfaces. The participant session outlives a visit to the caregiver page; its camera does not. */
export default function Root({ runtime, care }: RootProps = {}) {
  const route = useRoute();
  const participant = useRef<Partial<MotifRuntime> | null>(null);
  if (route === 'caregiver') return <CaregiverPage care={care} />;
  participant.current ??= runtime ?? participantRuntime();
  return <App runtime={participant.current} />;
}

function CaregiverPage({ care }: { care?: CareState }) {
  const [state] = useState(() => care ?? sharedCareClient());
  return (
    <div className="app-shell caregiver-shell">
      <header className="app-header">
        <span className="brand"><BrandMark />motif<span className="brand-period">.</span></span>
        <div className="header-meta">
          <span className="privacy-tag"><Icon name="lock" size={15} />No camera is used on this page</span>
          <a className="route-link" href={PARTICIPANT_HREF}>Back to Motif</a>
        </div>
      </header>
      {state.status === 'ready' ? <CaregiverDashboard client={state.client} /> : (
        <main className="main-workspace caregiver-setup">
          <h1>The caregiver dashboard is not set up yet</h1>
          {state.status === 'invalid' && <p>{state.message}</p>}
          <p>Add the Supabase project URL and public publishable key as <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> in <code>.env.local</code>, then restart Motif. The steps are in <code>docs/supabase-setup.md</code>.</p>
          <p>Motif's own communication still works on this device without it.</p>
        </main>
      )}
      <footer className="app-footer"><span>Made for the way you move.</span><span>Only sign-in, pairing and request updates are sent · no video is uploaded or saved</span></footer>
    </div>
  );
}
