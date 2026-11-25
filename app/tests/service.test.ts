import { describe, expect, it } from 'vitest';
import { isServiceCall, secretKeys } from '../../supabase/functions/_shared/service';

const h = (o: Record<string, string>) => ({ get: (n: string) => o[n] ?? null });
const ROLE = 'eyJ.service.role';
const SECRET = 'sb_secret_abcdefghijklmnopqrstuvwxyz';

describe('server-only function calls', () => {
  it('reads secret keys in every format', () => {
    expect(secretKeys(JSON.stringify({ default: SECRET }))).toEqual([SECRET]);
    expect(secretKeys(JSON.stringify([SECRET]))).toEqual([SECRET]);
    expect(secretKeys(SECRET)).toEqual([SECRET]);
    expect(secretKeys(undefined)).toEqual([]);
  });
  it('accepts the webhook (service-role JWT) and the cron job (secret key)', () => {
    expect(isServiceCall(h({ Authorization: `Bearer ${ROLE}` }), ROLE, undefined)).toBe(true);
    expect(isServiceCall(h({ apikey: SECRET }), ROLE, JSON.stringify({ default: SECRET }))).toBe(true);
    expect(isServiceCall(h({ Authorization: `Bearer ${SECRET}` }), ROLE, JSON.stringify({ default: SECRET }))).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isServiceCall(h({}), ROLE, JSON.stringify({ default: SECRET }))).toBe(false);
    expect(isServiceCall(h({ Authorization: 'Bearer member-session' }), ROLE, JSON.stringify({ default: SECRET }))).toBe(false);
    expect(isServiceCall(h({ apikey: 'sb_publishable_xyz' }), ROLE, JSON.stringify({ default: SECRET }))).toBe(false);
    expect(isServiceCall(h({ apikey: '' }), undefined, JSON.stringify({ default: '' }))).toBe(false);
    expect(isServiceCall(h({ Authorization: 'Bearer ' }), '', undefined)).toBe(false);
  });
});
