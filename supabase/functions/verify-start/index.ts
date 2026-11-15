// Starts selfie + age verification with the chosen provider and returns the URL the app opens.
// Provider-neutral: set VERIFY_PROVIDER (e.g. "yoti", "ondato", "veriff") and fill in startSession()
// for that provider's API. Results come back to verify-webhook; the app never marks itself verified.
import { createClient } from 'npm:@supabase/supabase-js@2';

type Session = { reference: string; url: string };

async function startSession(memberId: string): Promise<Session> {
  const provider = Deno.env.get('VERIFY_PROVIDER');
  const apiUrl = Deno.env.get('VERIFY_API_URL');
  const apiKey = Deno.env.get('VERIFY_API_KEY');
  if (!provider || !apiUrl || !apiKey) throw new Error('verification_not_configured');
  // Most providers: create a session for liveness + face match + age, with our member id as the
  // external reference and verify-webhook as the callback. Adjust the body to the provider's API.
  const res = await fetch(`${apiUrl}/sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_reference: memberId,
      checks: ['liveness', 'face_match', 'age_over_18'],
      callback_url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/verify-webhook`,
    }),
  });
  if (!res.ok) throw new Error(`provider_error_${res.status}`);
  const body = await res.json();
  return { reference: body.id ?? body.session_id, url: body.url ?? body.client_url };
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorised', { status: 401 });
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return new Response('Unauthorised', { status: 401 });
  try {
    const s = await startSession(me.id);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    await admin.from('verifications').insert({ member: me.id, provider: Deno.env.get('VERIFY_PROVIDER'), reference: s.reference });
    return Response.json({ url: s.url });
  } catch (e) {
    return Response.json({ error: String((e as Error).message) }, { status: 502 });
  }
});
