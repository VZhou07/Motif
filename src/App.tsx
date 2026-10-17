import { setupProgress } from './app/progress';
import { useMotif, type MotifRuntime } from './app/useMotif';
import { CameraPanel } from './components/CameraPanel';
import { CommunicationView } from './components/CommunicationView';
import { BrandMark, Icon } from './components/Icon';
import { ComfortView, DiscoveryResultsView, FailedView, MappingConfirmView, MappingView, TiringView } from './components/ReviewViews';
import { CaptureView, ChooseView, SetupProgressBar, WelcomeView } from './components/SetupViews';

export default function App({ runtime }: { runtime?: Partial<MotifRuntime> } = {}) {
  const { snapshot, session, videoRef, startCamera, getStarted, stopCamera, cueStatus, setCuesEnabled } = useMotif(runtime);
  const progress = setupProgress(snapshot);
  const view = { snapshot, session };
  let content;
  switch (snapshot.stage) {
    case 'welcome': content = <WelcomeView {...view} onStartCamera={startCamera} onGetStarted={getStarted} />; break;
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
          {progress && <SetupProgressBar progress={progress} />}
          {snapshot.camera === 'error' && snapshot.cameraMessage && (
            <div className="error-banner" role="alert"><strong>The camera needs attention</strong><p>{snapshot.cameraMessage}</p></div>
          )}
          {content}
        </main>
        <CameraPanel snapshot={snapshot} videoRef={videoRef} onStart={() => void startCamera()} onStop={stopCamera} hideStart={snapshot.stage === 'welcome'}
          compact={snapshot.stage === 'welcome' && snapshot.camera !== 'running'}
          cueStatus={cueStatus} onCuesEnabled={setCuesEnabled} />
      </div>
      <p className="sr-only" aria-live="polite">{snapshot.announcement}</p>
      <footer className="app-footer"><span>Made for the way you move.</span><span>Assistive interaction prototype · not a medical device · no video is uploaded or saved</span></footer>
    </div>
  );
}
