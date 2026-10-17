/** Only public project configuration belongs in the browser bundle. */
export interface CareConfig { url: string; publishableKey: string }
export type CareConfigState =
  | { status: 'not-configured' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; config: CareConfig };

const INVALID = 'Care networking is disabled: provide a valid Supabase project URL and public publishable or anon key.';

function projectOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    // Require a canonical origin, avoiding normalized lookalikes, paths and hidden ports.
    if (value !== url.origin && value !== `${url.origin}/`) return null;
    const hosted = url.protocol === 'https:' && !url.port
      && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.supabase\.co$/.test(url.hostname);
    const local = url.protocol === 'http:' && url.port === '54321'
      && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    return hosted || local ? url.origin : null;
  } catch { return null; }
}

function publicKey(value: string): boolean {
  if (/^sb_publishable_[A-Za-z0-9_-]{16,512}$/.test(value)) return true;
  // Legacy anon API keys are public JWTs. This is a configuration check; Supabase
  // verifies their signatures. A service-role JWT must never enter the client.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const segment = value.split('.')[1]!;
    const encoded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const payload: unknown = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return typeof payload === 'object' && payload !== null && 'role' in payload && payload.role === 'anon';
  } catch { return false; }
}

export function parseCareConfig(env: Record<string, unknown>): CareConfigState {
  const rawUrl = env.VITE_SUPABASE_URL;
  const rawKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const absent = (value: unknown) => value === undefined || value === null || (typeof value === 'string' && !value.trim());
  if (absent(rawUrl) && absent(rawKey)) return { status: 'not-configured' };
  if (typeof rawUrl !== 'string' || typeof rawKey !== 'string') return { status: 'invalid', message: INVALID };
  const url = projectOrigin(rawUrl.trim());
  const key = rawKey.trim();
  if (!url || !publicKey(key)) return { status: 'invalid', message: INVALID };
  return { status: 'ready', config: { url, publishableKey: key } };
}

/** Revalidate even programmatically supplied configuration before allowing a connection. */
export function validatedCareOrigin(config?: CareConfig): string | null {
  if (!config) return null;
  const parsed = parseCareConfig({ VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey });
  return parsed.status === 'ready' ? parsed.config.url : null;
}

/** Vite uses this same parser/policy as the runtime guard. Never insert API keys into HTML. */
export function applyCareConnectPolicy(html: string, config?: CareConfig): string {
  const origin = validatedCareOrigin(config);
  if (!origin) return html;
  let replaced = false;
  const result = html.replace(/(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]+)(")/, (_match, start: string, policy: string, end: string) => {
    if (!/(?:^|;)\s*connect-src\s+/.test(policy)) throw new Error('Motif connection security policy is missing.');
    replaced = true;
    return `${start}${policy.replace(/connect-src\s+[^;]+/, `connect-src 'self' blob: data: ${origin}`)}${end}`;
  });
  if (!replaced) throw new Error('Motif connection security policy is missing.');
  return result;
}
