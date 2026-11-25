// Yoti Age Verification (https://developers.yoti.com/age-verification): the pieces that don't
// touch the network, shared by verify-start and verify-webhook and covered by app/tests/yoti.test.ts.
//
// Flow: verify-start creates a session (POST {api}/api/v1/sessions) and sends the member to Yoti's
// hosted page. Yoti posts a notification to verify-webhook when an attempt finishes. The webhook
// never trusts that body: it fetches the session result from Yoti with our API key and decides
// from that.

export const YOTI_API = 'https://age.yoti.com';

/** Pages on the public site that the member lands on when they finish or cancel at Yoti. */
export const YOTI_DONE_URL = 'https://pezzadox.github.io/dial/quick-dial/verified.html';

export type YotiSessionOptions = {
  notificationUrl: string;
  /** Age estimation must clear this age, a buffer above 18 ("Challenge 25" by default). Anyone
   *  estimated younger can still prove they're 18+ with ID or the Yoti app instead. */
  estimationThreshold?: number;
  ttlSeconds?: number;
};

/** The create-session body: over 18, by selfie age estimation, photo ID or a Yoti Digital ID. */
export function yotiSessionBody(o: YotiSessionOptions) {
  const estimation = Math.max(18, Math.round(o.estimationThreshold ?? 25));
  return {
    type: 'OVER',
    ttl: o.ttlSeconds ?? 900,
    age_estimation: { allowed: true, threshold: estimation, level: 'PASSIVE' },
    doc_scan: { allowed: true, threshold: 18, authenticity: 'AUTO', level: 'PASSIVE' },
    digital_id: { allowed: true, threshold: 18 },
    callback: { url: YOTI_DONE_URL, auto: true },
    cancel_url: `${YOTI_DONE_URL}?cancelled=1`,
    notification_url: o.notificationUrl,
    synchronous_checks: true,   // hold the member at Yoti until ID checks finish, so they come back to an answer
  };
}

/** The page that runs the check, for a session Yoti just created. */
export function yotiUserUrl(sessionId: string, sdkId: string, api = YOTI_API): string {
  return `${api}?sessionId=${encodeURIComponent(sessionId)}&sdkId=${encodeURIComponent(sdkId)}`;
}

/** The session id in a Yoti notification (the notification's own "id" is something else). */
export function yotiSessionId(notification: any): string | null {
  const id = notification?.session_key ?? notification?.session_id ?? notification?.sessionId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

export type Verdict = { status: 'passed' | 'failed' | 'pending'; over18: boolean | null };

/** What a session result means for the member. Only COMPLETE passes. A failed attempt doesn't
 *  show someone is under 18 (estimation uses a higher threshold, and ID scans can fail for other
 *  reasons), so over18 stays unknown and they can try again. */
export function yotiVerdict(result: any): Verdict {
  switch (result?.status) {
    case 'COMPLETE': return { status: 'passed', over18: true };
    case 'FAIL': case 'ERROR': case 'CANCELLED': return { status: 'failed', over18: null };
    default: return { status: 'pending', over18: null };   // PENDING, IN_PROGRESS, or anything new
  }
}
