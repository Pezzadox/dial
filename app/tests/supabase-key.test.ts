import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { publicKeyProblem } = require('../supabase-key.js') as { publicKeyProblem: (k?: string) => string | null };

const jwt = (claims: object) =>
  ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), 'c2lnbmF0dXJl'].join('.');

describe('publicKeyProblem', () => {
  it('accepts a publishable key', () => {
    expect(publicKeyProblem('sb_publishable_abcDEF123_xyz-456')).toBeNull();
  });

  it('accepts a legacy anon key', () => {
    expect(publicKeyProblem(jwt({ iss: 'supabase', ref: 'abc', role: 'anon' }))).toBeNull();
  });

  it('refuses secret and service_role keys, which must never ship in an app', () => {
    expect(publicKeyProblem('sb_secret_abcDEF123456')).toMatch(/secret key/);
    expect(publicKeyProblem(jwt({ role: 'service_role' }))).toMatch(/service_role/);
  });

  it('refuses anything that is not a Supabase key', () => {
    expect(publicKeyProblem('jbcdzsfgqqmwwrwublzo')).toMatch(/not a Supabase key/);
    expect(publicKeyProblem('sb_publishable_')).toMatch(/not a Supabase key/);
    expect(publicKeyProblem('')).toMatch(/empty/);
    expect(publicKeyProblem(undefined)).toMatch(/empty/);
  });

  it('refuses a key pasted with a line break', () => {
    expect(publicKeyProblem('sb_publishable_abcDEF123_xyz\n')).toMatch(/line break/);
  });

  it('never repeats the key in its message', () => {
    const key = 'not-a-real-key-1234567890';
    expect(publicKeyProblem(key)).not.toContain(key);
  });
});
