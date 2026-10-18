import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../src/App';
import '../../../src/styles.css';
import { installOfflineGuard } from '../../../src/tracker/offline';
import { parseCareConfig } from '../../../src/care/config';

// Same bootstrap as src/main.tsx: the network guard is installed before anything can load.
const care = parseCareConfig(import.meta.env);
installOfflineGuard(window, care.status === 'ready' ? care.config : undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
