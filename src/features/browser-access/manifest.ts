import type { CareConfig } from '../../care/config';
import { buildExtensionCsp } from './csp';

export const EXTENSION_VERSION = '0.1.0';
export const SIDE_PANEL_PAGE = 'sidepanel.html';
export const GRANT_CAMERA_PAGE = 'grant-camera.html';

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  description: string;
  version: string;
  minimum_chrome_version: string;
  permissions: string[];
  optional_host_permissions: string[];
  action: { default_title: string };
  side_panel: { default_path: string };
  background: { service_worker: string; type: 'module' };
  content_security_policy: { extension_pages: string };
}

/** Generated at build time (extensions/motif/vite.config.ts) and asserted by tests. No broad host grants. */
export function buildManifest(care?: CareConfig): ExtensionManifest {
  return {
    manifest_version: 3,
    name: 'Motif Browser Companion',
    description: 'Lets Motif scroll and go back on pages a helper has allowed. Camera processing stays on this device.',
    version: EXTENSION_VERSION,
    minimum_chrome_version: '116',
    permissions: ['sidePanel', 'scripting', 'storage'],
    optional_host_permissions: ['https://*/*', 'http://127.0.0.1/*', 'http://localhost/*'],
    action: { default_title: 'Motif' },
    side_panel: { default_path: SIDE_PANEL_PAGE },
    background: { service_worker: 'background.js', type: 'module' },
    content_security_policy: { extension_pages: buildExtensionCsp(care) },
  };
}
