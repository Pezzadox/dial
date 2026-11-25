// Calls only the server side may make (database webhooks and the cron job), shared by quick-push
// and moderate-content and covered by app/tests/service.test.ts.
//
// Database Webhooks send the legacy service-role JWT as "Authorization: Bearer …". The Cron
// integration sends one of the project's new secret keys (sb_secret_…) in an "apikey" header.
// Both are accepted; nothing a member's app holds (the anon key, a session) is.

type Headers = { get(name: string): string | null };

/** The project's secret keys from SUPABASE_SECRET_KEYS, however that is formatted. */
export function secretKeys(raw: string | undefined | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (typeof v === 'string') return [v];
    if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
    if (v && typeof v === 'object') return Object.values(v).filter((x): x is string => typeof x === 'string');
  } catch { /* not JSON: a plain list */ }
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isServiceCall(headers: Headers, serviceRoleKey: string | undefined, secretKeysEnv: string | undefined): boolean {
  const auth = headers.get('Authorization') ?? '';
  if (serviceRoleKey && auth === `Bearer ${serviceRoleKey}`) return true;
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const apikey = headers.get('apikey') ?? '';
  return secretKeys(secretKeysEnv).some((k) => k.length >= 20 && (k === apikey || k === bearer));
}
