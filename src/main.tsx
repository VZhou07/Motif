import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installOfflineGuard } from './tracker/offline';

// Before anything can load: MediaPipe's built-in usage logging must never leave this device.
installOfflineGuard(window);

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
