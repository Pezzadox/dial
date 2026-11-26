import { describe, expect, it } from 'vitest';
import {
  ATTEMPTS_MESSAGE, DEFAULT_MONTHLY_CHECKS, DIDIT_DONE_URL, FULL_MESSAGE, capDecision, decisionAges,
  diditSessionBody, diditSessionId, diditVerdict, isOutOfCredit, monthStart, monthlyChecks, verifyDiditSignature,
} from '../../supabase/functions/_shared/didit';

const NOW = new Date('2026-11-26T12:00:00Z');

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Didit age check', () => {
  it('creates a session for the member on our workflow, returning them to our page', () => {
    expect(diditSessionBody({ workflowId: 'wf-1', member: 'm-1' })).toEqual({ workflow_id: 'wf-1', vendor_data: 'm-1', callback: DIDIT_DONE_URL });
  });

  it('reads the session id from a webhook', () => {
    expect(diditSessionId({ session_id: 's-1', status: 'Approved' })).toBe('s-1');
    expect(diditSessionId({ status: 'Approved' })).toBeNull();
    expect(diditSessionId(null)).toBeNull();
  });

  describe('signature', () => {
    const body = '{"session_id":"s-1","status":"Approved"}';
    const secret = 'whsec_test';
    const now = 1_800_000_000;
    it('accepts a correctly signed, recent delivery', async () => {
      expect(await verifyDiditSignature({ rawBody: body, signature: await sign(body, secret), timestamp: String(now), secret, nowSeconds: now + 10 })).toBe(true);
    });
    it('refuses a changed body, a wrong secret, a missing header or an old delivery', async () => {
      const sig = await sign(body, secret);
      expect(await verifyDiditSignature({ rawBody: body.replace('Approved', 'Declined'), signature: sig, timestamp: String(now), secret, nowSeconds: now })).toBe(false);
      expect(await verifyDiditSignature({ rawBody: body, signature: await sign(body, 'other'), timestamp: String(now), secret, nowSeconds: now })).toBe(false);
      expect(await verifyDiditSignature({ rawBody: body, signature: null, timestamp: String(now), secret, nowSeconds: now })).toBe(false);
      expect(await verifyDiditSignature({ rawBody: body, signature: sig, timestamp: null, secret, nowSeconds: now })).toBe(false);
      expect(await verifyDiditSignature({ rawBody: body, signature: sig, timestamp: String(now - 301), secret, nowSeconds: now })).toBe(false);
    });
  });

  describe('verdict', () => {
    it('passes an approved selfie estimate of 18 or over', () => {
      expect(diditVerdict({ status: 'Approved', liveness_checks: [{ status: 'Approved', age_estimation: 27.3 }] }, NOW)).toEqual({ status: 'passed', over18: true });
    });
    it('goes by the ID when the member showed one, not by a young-looking selfie', () => {
      const d = { status: 'Approved', liveness_checks: [{ age_estimation: 17.2 }], id_verifications: [{ status: 'Approved', date_of_birth: '1995-03-01' }] };
      expect(diditVerdict(d, NOW).status).toBe('passed');
      expect(diditVerdict({ status: 'Approved', id_verifications: [{ age: 30 }] }, NOW).status).toBe('passed');
    });
    it('never passes anyone the decision shows as under 18, even if approved', () => {
      expect(diditVerdict({ status: 'Approved', liveness_checks: [{ age_estimation: 16.8 }] }, NOW).status).toBe('failed');
      expect(diditVerdict({ status: 'Approved', id_verifications: [{ date_of_birth: '2009-01-01' }] }, NOW).status).toBe('failed');
      expect(diditVerdict({ status: 'Approved', id_verifications: [{ date_of_birth: '2008-11-27' }] }, NOW).status).toBe('failed');   // 18 tomorrow
      expect(diditVerdict({ status: 'Approved', id_verifications: [{ date_of_birth: '2008-11-26' }] }, NOW).status).toBe('passed');   // 18 today
    });
    it('sends an approval with no age in it to review, in case the workflow has no age check', () => {
      expect(diditVerdict({ status: 'Approved', liveness_checks: [{ status: 'Approved' }] }, NOW)).toEqual({ status: 'review', over18: null });
    });
    it('fails declined and unfinished sessions without treating them as proof of being under 18', () => {
      for (const s of ['Declined', 'Expired', 'Abandoned', 'Kyc Expired']) expect(diditVerdict({ status: s }, NOW)).toEqual({ status: 'failed', over18: null });
    });
    it('waits on sessions that are still going', () => {
      expect(diditVerdict({ status: 'In Review' }, NOW).status).toBe('review');
      for (const s of ['Not Started', 'In Progress', 'Awaiting User', 'Resubmitted', undefined, 'Something New']) expect(diditVerdict({ status: s }, NOW).status).toBe('pending');
    });
    it('finds ages anywhere in the decision', () => {
      expect(decisionAges({ a: { b: [{ age_estimation: 22 }] }, id_verification: { age: 40 } }, NOW)).toEqual({ id: [40], estimated: [22] });
    });
  });

  describe('monthly cap', () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ member: `m-${i}`, reference: `s-${i}` }));
    it('lets new members start until the cap is reached', () => {
      expect(capDecision({ member: 'new', thisMonth: rows(69), cap: 70 })).toEqual({ ok: true });
      expect(capDecision({ member: 'new', thisMonth: rows(70), cap: 70 })).toEqual({ ok: false, message: FULL_MESSAGE });
    });
    it('always lets a member who already started this month carry on', () => {
      expect(capDecision({ member: 'm-3', thisMonth: rows(70), cap: 70 })).toEqual({ ok: true });
    });
    it('stops one member using up the checks with repeated attempts', () => {
      const mine = [1, 2, 3].map((i) => ({ member: 'me', reference: `r-${i}` }));
      expect(capDecision({ member: 'me', thisMonth: mine.slice(0, 2), cap: 70 })).toEqual({ ok: true });
      expect(capDecision({ member: 'me', thisMonth: mine, cap: 70 })).toEqual({ ok: false, message: ATTEMPTS_MESSAGE });
    });
    it('reads the cap setting, falling back to the default', () => {
      expect(monthlyChecks(undefined)).toBe(DEFAULT_MONTHLY_CHECKS);
      expect(monthlyChecks('')).toBe(DEFAULT_MONTHLY_CHECKS);
      expect(monthlyChecks('abc')).toBe(DEFAULT_MONTHLY_CHECKS);
      expect(monthlyChecks('-5')).toBe(DEFAULT_MONTHLY_CHECKS);
      expect(monthlyChecks('250')).toBe(250);
      expect(monthlyChecks('0')).toBe(0);
    });
    it('counts from midnight UTC on the 1st', () => {
      expect(monthStart(new Date('2026-11-26T23:59:00Z'))).toBe('2026-11-01T00:00:00.000Z');
      expect(monthStart(new Date('2027-01-01T00:00:01Z'))).toBe('2027-01-01T00:00:00.000Z');
    });
    it('treats Didit refusing for credit as full', () => {
      expect(isOutOfCredit(402, '')).toBe(true);
      expect(isOutOfCredit(403, '{"detail":"Insufficient credit balance"}')).toBe(true);
      expect(isOutOfCredit(403, '{"detail":"Invalid API key"}')).toBe(false);
      expect(isOutOfCredit(500, 'credit')).toBe(false);
    });
  });
});
