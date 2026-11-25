// Receives Yoti's notification when an age-check attempt finishes. The notification body is only
// a prompt: we look the session up in our own table, then fetch its result from Yoti with our API
// key, so a forged notification can't mark anyone verified. Deployed without Supabase JWT checks
// (Yoti has no Supabase sign-in); see .github/workflows/quick-backend.yml.
//
// A pass sets verified_at and age_verified_at, which is what lets a member be shown to others.
// A failed attempt is recorded and the member can try again.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { YOTI_API, yotiSessionId, yotiVerdict } from '../_shared/yoti.ts';

const ack = (body: Record<string, unknown>) => Response.json(body);   // always 200, or Yoti keeps retrying

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  let evt: unknown;
  try { evt = await req.json(); } catch { return new Response('Bad request', { status: 400 }); }
  const sessionId = yotiSessionId(evt);
  if (!sessionId) return new Response('Bad request', { status: 400 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: v } = await db.from('verifications').select('id, member, status').eq('reference', sessionId).maybeSingle();
  if (!v) return ack({ ok: false, reason: 'unknown_session' });
  if (v.status === 'passed') return ack({ ok: true, status: 'passed' });

  const sdkId = Deno.env.get('VERIFY_SDK_ID'); const apiKey = Deno.env.get('VERIFY_API_KEY');
  if (!sdkId || !apiKey) return new Response('Not configured', { status: 503 });
  const api = Deno.env.get('VERIFY_API_URL') ?? YOTI_API;
  const res = await fetch(`${api}/api/v1/sessions/${encodeURIComponent(sessionId)}/result`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Yoti-Sdk-Id': sdkId },
  });
  if (!res.ok) return new Response('Provider unavailable', { status: 502 });   // Yoti will retry
  const verdict = yotiVerdict(await res.json());
  if (verdict.status === 'pending') return ack({ ok: true, status: 'pending' });

  const now = new Date().toISOString();
  await db.from('verifications').update({ status: verdict.status, age_over_18: verdict.over18, decided_at: now }).eq('id', v.id);
  if (verdict.status === 'passed') {
    await db.from('profiles').update({ verified_at: now, age_verified_at: now }).eq('id', v.member);
  }
  return ack({ ok: true, status: verdict.status });
});
