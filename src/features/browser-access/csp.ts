import { validatedCareOrigin } from '../../care/config';
import type { CareConfig } from '../../care/config';

/**
 * One policy for the manifest and the sidepanel.html meta. connect-src matches the shape that
 * applyCareConnectPolicy writes into index.html, so both layers agree.
 */
export function buildExtensionCsp(care?: CareConfig): string {
  const origin = validatedCareOrigin(care);
  const connect = ["'self'", 'blob:', 'data:', ...(origin ? [origin] : [])].join(' ');
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "object-src 'none'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    `connect-src ${connect}`,
    "base-uri 'none'",
  ].join('; ');
}

export function connectSources(csp: string): string[] {
  const match = /(?:^|;)\s*connect-src\s+([^;]+)/.exec(csp);
  return match ? match[1]!.trim().split(/\s+/) : [];
}
