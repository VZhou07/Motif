import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Read-only check of the caregiver service setup (W2 Q3): local settings, then what the configured
 * Supabase project answers to a signed-out caller. Never prints the key; sends it only to that project.
 */
const root = fileURLToPath(new URL('../', import.meta.url));
let failed = 0;
const pass = (text) => console.log(`PASS  ${text}`);
const fail = (text, fix) => { failed += 1; console.log(`FAIL  ${text}${fix ? `\n      → ${fix}` : ''}`); };

async function localEnv() {
  try {
    const text = await readFile(path.join(root, '.env.local'), 'utf8');
    return Object.fromEntries(text.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]));
  } catch { return {}; }
}

const file = await localEnv();
const url = process.env.VITE_SUPABASE_URL ?? file.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? file.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  const wrong = Object.keys(file).filter((name) => /SUPABASE/.test(name) && !name.startsWith('VITE_'));
  fail('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set',
    wrong.length ? `.env.local uses ${wrong.join(', ')}; rename them to the VITE_ names (Motif uses Vite)` : 'add them to .env.local (see docs/supabase-setup.md)');
  process.exit(1);
}
pass('VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set');

let origin;
try {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(parsed.hostname) || parsed.pathname !== '/' || parsed.search) throw new Error();
  origin = parsed.origin;
  pass(`project address is a hosted Supabase origin (${parsed.hostname})`);
} catch {
  fail('project address is a hosted Supabase origin', 'use https://<project-ref>.supabase.co with nothing after it');
  process.exit(1);
}

function keyKind(value) {
  if (value.startsWith('sb_publishable_')) return 'publishable';
  if (value.startsWith('sb_secret_')) return 'secret';
  try { return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'anon' ? 'anon' : 'other'; } catch { return 'other'; }
}
const kind = keyKind(key);
if (kind !== 'publishable' && kind !== 'anon') {
  fail('key is the public publishable key', 'never put a secret or service-role key in VITE_ variables; use the sb_publishable_ key');
  process.exit(1);
}
pass(`key is a public ${kind} key`);

const headers = { apikey: key, 'Content-Type': 'application/json' };
async function call(pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  let body = null;
  try { body = await response.json(); } catch { /* not JSON */ }
  return { status: response.status, body };
}

try {
  const settings = await call('/auth/v1/settings');
  if (settings.status !== 200) throw new Error(`HTTP ${settings.status}`);
  pass('the project answers');
  const external = settings.body?.external ?? {};
  if (external.email) pass('e-mail sign-in is on (caregivers)');
  else fail('e-mail sign-in is on (caregivers)', 'Authentication → Sign In / Providers → Email');
  if (external.anonymous_users) pass('anonymous sign-ins are on (device pairing)');
  else fail('anonymous sign-ins are on (device pairing)', 'Authentication → Sign In / Providers → Allow anonymous sign-ins, then Save changes');
} catch (error) {
  fail('the project answers', `could not reach ${origin} (${error.message})`);
  process.exit(1);
}

for (const table of ['care_groups', 'participants', 'care_requests']) {
  const result = await call(`/rest/v1/${table}?select=id&limit=1`);
  if (result.status === 401 || result.body?.code === '42501') pass(`table ${table} exists and is closed to signed-out callers`);
  else if (result.status === 200) fail(`table ${table} is closed to signed-out callers`, 'it is readable without sign-in; re-check the migration grants');
  else fail(`table ${table} exists`, 'run supabase/migrations/202610170001_care_foundation.sql once in the SQL Editor');
}
const access = await call('/rest/v1/rpc/motif_access', { method: 'POST', body: '{}' });
if (access.body?.code === '42501') pass('database functions exist and refuse signed-out callers');
else fail('database functions exist', 'run supabase/migrations/202610170001_care_foundation.sql once in the SQL Editor');

console.log(`\nRows: https://supabase.com/dashboard/project/${new URL(origin).hostname.split('.')[0]}/editor`);
console.log(failed ? `\n${failed} check(s) failed.` : '\nThe caregiver service is set up.');
process.exit(failed ? 1 : 0);
