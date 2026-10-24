import { createWorker } from '../../../src/features/browser-access/worker';

// Thin entry: registers the message listener synchronously and does nothing else. All decisions live in src/.
createWorker(chrome);
