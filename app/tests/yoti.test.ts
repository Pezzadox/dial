import { describe, expect, it } from 'vitest';
import { YOTI_DONE_URL, yotiSessionBody, yotiSessionId, yotiUserUrl, yotiVerdict } from '../../supabase/functions/_shared/yoti';

describe('Yoti age check', () => {
  const body = yotiSessionBody({ notificationUrl: 'https://x.supabase.co/functions/v1/verify-webhook' });
  it('asks for over 18, with a Challenge 25 buffer on selfie estimation', () => {
    expect(body.type).toBe('OVER');
    expect(body.age_estimation).toMatchObject({ allowed: true, threshold: 25 });
    expect(body.doc_scan).toMatchObject({ allowed: true, threshold: 18 });
    expect(body.digital_id).toMatchObject({ allowed: true, threshold: 18 });
    expect(body.notification_url).toBe('https://x.supabase.co/functions/v1/verify-webhook');
    expect(body.callback).toEqual({ url: YOTI_DONE_URL, auto: true });
  });
  it('never lets the estimation threshold drop below 18', () => {
    expect(yotiSessionBody({ notificationUrl: 'https://n', estimationThreshold: 16 }).age_estimation.threshold).toBe(18);
    expect(yotiSessionBody({ notificationUrl: 'https://n', estimationThreshold: 21 }).age_estimation.threshold).toBe(21);
  });
  it('builds the hosted check URL', () => {
    expect(yotiUserUrl('abc-123', 'sdk 1')).toBe('https://age.yoti.com?sessionId=abc-123&sdkId=sdk%201');
  });
  it('reads the session id, not the notification id', () => {
    expect(yotiSessionId({ id: 'notification', session_key: 'session' })).toBe('session');
    expect(yotiSessionId({ id: 'notification' })).toBeNull();
    expect(yotiSessionId(null)).toBeNull();
  });
  it('passes only a COMPLETE session, and never treats a fail as proof of being under 18', () => {
    expect(yotiVerdict({ status: 'COMPLETE' })).toEqual({ status: 'passed', over18: true });
    for (const s of ['FAIL', 'ERROR', 'CANCELLED']) expect(yotiVerdict({ status: s })).toEqual({ status: 'failed', over18: null });
    for (const s of ['PENDING', 'IN_PROGRESS', undefined, 'SOMETHING_NEW']) expect(yotiVerdict({ status: s }).status).toBe('pending');
  });
});
