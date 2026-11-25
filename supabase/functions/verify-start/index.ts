// Starts the selfie and age check with Yoti and returns the URL the app opens.
// Secrets (Supabase → Edge Functions → Secrets): VERIFY_PROVIDER=yoti, VERIFY_SDK_ID and
// VERIFY_API_KEY from the Yoti Hub. Optional: VERIFY_API_URL (default https://age.yoti.com) and
// VERIFY_ESTIMATION_THRESHOLD (default 25). Results come back to verify-webhook; the app never
// marks itself verified.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { YOTI_API, yotiSessionBody, yotiUserUrl } from '../_shared/yoti.ts';

type Session = { reference: string; url: string };

async function startSession(): Promise<Session> {
  const provider = Deno.env.get('VERIFY_PROVIDER');
  const sdkId = Deno.env.get('VERIFY_SDK_ID');
  const apiKey = Deno.env.get('VERIFY_API_KEY');
  if (provider !== 'yoti' || !sdkId || !apiKey) throw new Error('verification_not_configured');
  const api = Deno.env.get('VERIFY_API_URL') ?? YOTI_API;
  const threshold = Number(Deno.env.get('VERIFY_ESTIMATION_THRESHOLD') ?? '25');
  const res = await fetch(`${api}/api/v1/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Yoti-Sdk-Id': sdkId, 'Content-Type': 'application/json' },
    body: JSON.stringify(yotiSessionBody({
      notificationUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/verify-webhook`,
      estimationThreshold: Number.isFinite(threshold) ? threshold : 25,
    })),
  });
  if (!res.ok) throw new Error(`provider_error_${res.status}`);
  const body = await res.json();
  if (!body?.id) throw new Error('provider_error_no_session');
  return { reference: body.id, url: yotiUserUrl(body.id, sdkId, api) };
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorised', { status: 401 });
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return new Response('Unauthorised', { status: 401 });
  try {
    const s = await startSession();
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error } = await admin.from('verifications').insert({ member: me.id, provider: 'yoti', reference: s.reference });
    if (error) throw new Error('could_not_record_session');
    return Response.json({ url: s.url });
  } catch (e) {
    return Response.json({ error: String((e as Error).message) }, { status: 502 });
  }
});
