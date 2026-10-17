import type { Stage } from './app/types';
import { useMotif, type MotifRuntime } from './app/useMotif';
import { CameraPanel } from './components/CameraPanel';
import { CommunicationView } from './components/CommunicationView';
import { BrandMark, Icon } from './components/Icon';
import { ComfortView, DiscoveryResultsView, FailedView, MappingConfirmView, MappingView, RecalibrateView, TiringView } from './components/ReviewViews';
import { CaptureView, ChooseView, WelcomeView } from './components/SetupViews';

const SETUP_STEP: Partial<Record<Stage, number>> = {
  welcome: 0, baseline: 0, choose: 1, discover: 1, 'discover-results': 1, training: 1, verify: 1, negative: 1, 'setup-failed': 1, comfort: 1, mapping: 2, 'mapping-confirm': 2,
};

export default function App({ runtime }: { runtime?: Partial<MotifRuntime> } = {}) {
  const { snapshot, session, videoRef, startCamera, stopCamera, cueStatus, setCuesEnabled } = useMotif(runtime);
  const step = SETUP_STEP[snapshot.stage];
  const view = { snapshot, session };
  let content;
  switch (snapshot.stage) {
    case 'welcome': content = <WelcomeView {...view} onStartCamera={startCamera} />; break;
    case 'baseline':
    case 'training':
    case 'verify':
    case 'negative':
    case 'discover': content = <CaptureView {...view} />; break;
    case 'discover-results': content = <DiscoveryResultsView {...view} />; break;
    case 'choose': content = <ChooseView {...view} />; break;
    case 'setup-failed': content = <FailedView {...view} />; break;
    case 'comfort': content = <ComfortView {...view} />; break;
    case 'mapping': content = <MappingView {...view} />; break;
    case 'mapping-confirm': content = <MappingConfirmView {...view} />; break;
    case 'recalibrate-confirm': content = <RecalibrateView {...view} />; break;
    case 'tiring': content = <TiringView {...view} />; break;
    case 'practice':
    case 'communication': content = <CommunicationView {...view} />; break;
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#main-content" aria-label="Motif, skip to main content"><BrandMark />motif<span className="brand-period">.</span></a>
        <div className="header-meta">
          <span className="privacy-tag"><Icon name="lock" size={15} />Camera processing stays on this device</span>
          <span className="input-tag">{snapshot.inputMode === 'assisted' ? 'Assisted switch' : 'Personal movement'}</span>
        </div>
      </header>
      <div className="workspace-layout">
        <main id="main-content" className="main-workspace" tabIndex={-1}>
          {step !== undefined && (
            <nav className="setup-steps" aria-label="Setup progress">
              {['Settle in', 'Find your movement', 'Make it yours'].map((label, index) => (
                <span key={label} className={step >= index ? 'step-current' : ''} aria-current={step === index ? 'step' : undefined}>
                  <span>{step > index ? <Icon name="check" size={12} /> : `0${index + 1}`}</span>{label}
                </span>
              ))}
            </nav>
          )}
          {snapshot.camera === 'error' && snapshot.cameraMessage && (
            <div className="error-banner" role="alert"><strong>The camera needs attention</strong><p>{snapshot.cameraMessage}</p></div>
          )}
          {content}
        </main>
        <CameraPanel snapshot={snapshot} videoRef={videoRef} onStart={() => void startCamera()} onStop={stopCamera}
          cueStatus={cueStatus} onCuesEnabled={setCuesEnabled} />
      </div>
      <p className="sr-only" aria-live="polite">{snapshot.announcement}</p>
      <footer className="app-footer"><span>Made for the way you move.</span><span>Assistive interaction prototype · not a medical device · no video is uploaded or saved</span></footer>
    </div>
  );
}
