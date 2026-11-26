// Receives Didit's webhook when an age-check session changes. The delivery must carry a valid
// X-Signature (HMAC of the exact body with DIDIT_WEBHOOK_SECRET) and a recent X-Timestamp. Even then
// the body is only a prompt: we look the session up in our own table and fetch its decision from
// Didit with our API key, so a forged or replayed delivery can't mark anyone verified. Deployed
// without Supabase JWT checks (Didit has no Supabase sign-in); see .github/workflows/quick-backend.yml.
//
// A pass sets verified_at and age_verified_at, which is what lets a member be shown to others.
// A failed attempt is recorded and the member can try again.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DIDIT_API, diditSessionId, diditVerdict, verifyDiditSignature } from '../_shared/didit.ts';

const ack = (body: Record<string, unknown>) => Response.json(body);   // 200, or Didit keeps retrying

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('DIDIT_WEBHOOK_SECRET'); const apiKey = Deno.env.get('DIDIT_API_KEY');
  if (!secret || !apiKey) return new Response('Not configured', { status: 503 });

  const rawBody = await req.text();
  const signed = await verifyDiditSignature({
    rawBody, signature: req.headers.get('x-signature'), timestamp: req.headers.get('x-timestamp'), secret,
  });
  if (!signed) return new Response('Bad signature', { status: 401 });

  let evt: unknown;
  try { evt = JSON.parse(rawBody); } catch { return new Response('Bad request', { status: 400 }); }
  const sessionId = diditSessionId(evt);
  if (!sessionId) return ack({ ok: true, ignored: true });   // other event types

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: v } = await db.from('verifications').select('id, member, status').eq('reference', sessionId).maybeSingle();
  if (!v) return ack({ ok: false, reason: 'unknown_session' });
  if (v.status === 'passed') return ack({ ok: true, status: 'passed' });

  const res = await fetch(`${DIDIT_API}/v3/session/${encodeURIComponent(sessionId)}/decision/`, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) return new Response('Provider unavailable', { status: 502 });   // Didit will retry
  const decision = await res.json();
  if (decision?.vendor_data && decision.vendor_data !== v.member) return ack({ ok: false, reason: 'member_mismatch' });
  const verdict = diditVerdict(decision);
  if (verdict.status === 'pending') return ack({ ok: true, status: 'pending' });

  const now = new Date().toISOString();
  await db.from('verifications').update({ status: verdict.status, age_over_18: verdict.over18, decided_at: now }).eq('id', v.id);
  if (verdict.status === 'passed') {
    await db.from('profiles').update({ verified_at: now, age_verified_at: now }).eq('id', v.member);
  }
  return ack({ ok: true, status: verdict.status });
});
