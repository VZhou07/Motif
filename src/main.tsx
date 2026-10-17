import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installOfflineGuard } from './tracker/offline';
import { parseCareConfig } from './care/config';

// Before anything can load: MediaPipe's built-in usage logging must never leave this device.
const care = parseCareConfig(import.meta.env);
installOfflineGuard(window, care.status === 'ready' ? care.config : undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
