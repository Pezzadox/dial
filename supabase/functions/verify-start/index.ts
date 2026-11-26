// Starts the selfie and age check with Didit and returns the URL the app opens.
// Secrets (Supabase → Edge Functions → Secrets): DIDIT_API_KEY and DIDIT_WORKFLOW_ID from the Didit
// Business Console. Optional: QUICK_MONTHLY_CHECKS (default 70), how many new members can start a
// check each month, so the free plan's credit is never overrun. Results come back to verify-webhook;
// the app never marks itself verified.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { DIDIT_API, FULL_MESSAGE, capDecision, diditSessionBody, isOutOfCredit, monthStart, monthlyChecks } from '../_shared/didit.ts';

class Full extends Error {}

async function startSession(member: string): Promise<{ reference: string; url: string }> {
  const apiKey = Deno.env.get('DIDIT_API_KEY');
  const workflowId = Deno.env.get('DIDIT_WORKFLOW_ID');
  if (!apiKey || !workflowId) throw new Error('verification_not_configured');
  const res = await fetch(`${DIDIT_API}/v3/session/`, {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(diditSessionBody({ workflowId, member })),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (isOutOfCredit(res.status, text)) throw new Full(FULL_MESSAGE);
    throw new Error(`provider_error_${res.status}`);
  }
  const body = await res.json();
  if (!body?.session_id || !body?.url) throw new Error('provider_error_no_session');
  return { reference: body.session_id, url: body.url };
}

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorised', { status: 401 });
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return new Response('Unauthorised', { status: 401 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: rows, error: readError } = await admin.from('verifications')
      .select('member, reference').eq('provider', 'didit').gte('created_at', monthStart()).limit(10000);
    if (readError) throw new Error('could_not_read_sessions');
    const cap = capDecision({ member: me.id, thisMonth: rows ?? [], cap: monthlyChecks(Deno.env.get('QUICK_MONTHLY_CHECKS')) });
    // 200 with a message the app shows as it is, so older app versions show it too.
    if (!cap.ok) return Response.json({ error: cap.message, full: true });

    const s = await startSession(me.id);
    // Didit hands back the same session while one is unfinished, so record each session once.
    const { error } = await admin.from('verifications')
      .upsert({ member: me.id, provider: 'didit', reference: s.reference }, { onConflict: 'reference', ignoreDuplicates: true });
    if (error) throw new Error('could_not_record_session');
    return Response.json({ url: s.url });
  } catch (e) {
    if (e instanceof Full) return Response.json({ error: e.message, full: true });
    return Response.json({ error: String((e as Error).message) }, { status: 502 });
  }
});
