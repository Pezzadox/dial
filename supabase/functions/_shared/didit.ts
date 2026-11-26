// Didit age check (https://docs.didit.me): the pieces that don't touch the network, shared by
// verify-start and verify-webhook and covered by app/tests/didit.test.ts.
//
// Flow: verify-start creates a session (POST {api}/v3/session/) for the member's workflow and sends
// them to Didit's hosted page: a selfie age estimate, with photo ID when the estimate is close to 18.
// Didit posts a signed webhook to verify-webhook when the session changes. The webhook checks the
// signature, then fetches the decision from Didit with our API key and decides from that.
//
// Cost: Didit's free plan gives $10 of credit a month and is prepaid. verify-start also stops new
// members once a monthly number of members have started a check (QUICK_MONTHLY_CHECKS), so the free
// credit is never overrun. Members who already started this month can always finish.

export const DIDIT_API = 'https://verification.didit.me';

/** The page on the public site that members land on when they finish at Didit. */
export const DIDIT_DONE_URL = 'https://pezzadox.github.io/dial/quick-dial/verified.html';

/** Members who can start an age check each month, unless QUICK_MONTHLY_CHECKS says otherwise. */
export const DEFAULT_MONTHLY_CHECKS = 70;

/** Attempts a member gets each month, so one person can't use up everyone's free checks. */
export const MAX_ATTEMPTS_PER_MONTH = 3;

export const FULL_MESSAGE = 'Quick Dial is full for new members this month. Please try again on the 1st.';
export const ATTEMPTS_MESSAGE = 'You\'ve tried the age check three times this month. Please try again on the 1st.';

export function diditSessionBody(o: { workflowId: string; member: string }) {
  return { workflow_id: o.workflowId, vendor_data: o.member, callback: DIDIT_DONE_URL };
}

/** Midnight UTC on the 1st of this month, as an ISO string. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** The monthly cap from its setting. A blank or broken value falls back to the default. */
export function monthlyChecks(raw?: string | null): number {
  if (raw == null || raw.trim() === '') return DEFAULT_MONTHLY_CHECKS;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MONTHLY_CHECKS;
}

/** Whether this member may start (or carry on with) an age check this month. */
export function capDecision(o: { member: string; thisMonth: { member: string; reference: string }[]; cap: number }):
  { ok: true } | { ok: false; message: string } {
  const mine = o.thisMonth.filter((r) => r.member === o.member);
  if (mine.length >= MAX_ATTEMPTS_PER_MONTH) return { ok: false, message: ATTEMPTS_MESSAGE };
  if (mine.length > 0) return { ok: true };
  const members = new Set(o.thisMonth.map((r) => r.member));
  return members.size >= o.cap ? { ok: false, message: FULL_MESSAGE } : { ok: true };
}

/** Didit refuses new sessions when the prepaid credit has run out. */
export function isOutOfCredit(status: number, body: string): boolean {
  return status === 402 || (status === 403 && /credit|balance|top.?up|payment/i.test(body));
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** X-Signature is a hex HMAC-SHA256 of the exact request body, keyed with the destination's secret.
 *  X-Timestamp (Unix seconds) must be within five minutes, so an old delivery can't be replayed. */
export async function verifyDiditSignature(o: {
  rawBody: string; signature: string | null; timestamp: string | null; secret: string; nowSeconds?: number;
}): Promise<boolean> {
  if (!o.signature || !o.timestamp || !o.secret) return false;
  const ts = Number(o.timestamp);
  const now = o.nowSeconds ?? Date.now() / 1000;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(o.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(o.rawBody)));
  const got = o.signature.trim().toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function diditSessionId(evt: any): string | null {
  const id = evt?.session_id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export type Verdict = { status: 'passed' | 'failed' | 'review' | 'pending'; over18: boolean | null };

function ageOn(dob: string, now: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < mo || (now.getUTCMonth() + 1 === mo && now.getUTCDate() < d)) age--;
  return age;
}

/** Ages in a decision: from ID (age or date_of_birth) and from selfie estimates (age_estimation). */
export function decisionAges(decision: any, now = new Date()): { id: number[]; estimated: number[] } {
  const id: number[] = []; const estimated: number[] = [];
  const walk = (v: any, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 6) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    for (const [k, x] of Object.entries(v)) {
      if (k === 'age_estimation' && typeof x === 'number') estimated.push(x);
      else if (k === 'age' && typeof x === 'number') id.push(x);
      else if (k === 'date_of_birth' && typeof x === 'string') { const a = ageOn(x, now); if (a != null) id.push(a); }
      else walk(x, depth + 1);
    }
  };
  walk(decision, 0);
  return { id, estimated };
}

/** What a Didit decision means for the member. "Approved" passes only when the decision also shows
 *  an age of 18 or over: from ID if they showed one, otherwise from the selfie estimate. An approved
 *  decision with no age in it goes to review rather than passing, in case the workflow was set up
 *  without an age check. A decline doesn't prove someone is under 18, so over18 stays unknown. */
export function diditVerdict(decision: any, now = new Date()): Verdict {
  switch (decision?.status) {
    case 'Approved': {
      const { id, estimated } = decisionAges(decision, now);
      const ages = id.length ? id : estimated;
      if (!ages.length) return { status: 'review', over18: null };
      return ages.every((a) => a >= 18) ? { status: 'passed', over18: true } : { status: 'failed', over18: null };
    }
    case 'Declined': case 'Expired': case 'Abandoned': case 'Kyc Expired':
      return { status: 'failed', over18: null };
    case 'In Review':
      return { status: 'review', over18: null };
    default:
      return { status: 'pending', over18: null };   // Not Started, In Progress, Awaiting User, Resubmitted, anything new
  }
}
