// Receives the provider's verdict. Checks the signature, then marks the member verified (selfie
// liveness + face match against their photos) and age-verified (18+). Anything unclear goes to review.
import { createClient } from 'npm:@supabase/supabase-js@2';

async function validSignature(req: Request, raw: string) {
  const secret = Deno.env.get('VERIFY_WEBHOOK_SECRET');
  const sig = req.headers.get('x-signature') ?? '';
  if (!secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== sig.length) return false;
  let diff = 0;                                        // constant-time comparison
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await validSignature(req, raw))) return new Response('Forbidden', { status: 403 });
  const evt = JSON.parse(raw);
  // Map the provider's payload here. Expected: session id, overall result, whether the person is 18+.
  const reference: string = evt.session_id ?? evt.id;
  const passed: boolean = evt.result === 'passed' || evt.status === 'approved';
  const over18: boolean | null = evt.age_over_18 ?? evt.checks?.age_over_18 ?? null;
  const unclear = !passed && (evt.result === 'review' || evt.status === 'resubmission_requested');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: v } = await db.from('verifications').select('id, member').eq('reference', reference).single();
  if (!v) return new Response('Unknown session', { status: 404 });
  const status = passed && over18 !== false ? 'passed' : unclear ? 'review' : 'failed';
  await db.from('verifications').update({ status, age_over_18: over18, decided_at: new Date().toISOString() }).eq('id', v.id);
  if (status === 'passed') {
    await db.from('profiles').update({ verified_at: new Date().toISOString(), age_verified_at: over18 ? new Date().toISOString() : null }).eq('id', v.member);
  }
  if (over18 === false) {
    // Under 18: pause the account at once and raise a priority report for the safety team.
    await db.from('profiles').update({ paused_until: '9999-12-31' }).eq('id', v.member);
    await db.from('reports').insert({ reporter: v.member, reported: v.member, reason: 'underage', detail: 'Age check failed at verification' });
  }
  return Response.json({ ok: true, status });
});
