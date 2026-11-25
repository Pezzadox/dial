// Checks every new photo and story before anyone sees it, using Claude.
// Call it from Database Webhooks on INSERT into public.media and public.quick_stories (and UPDATE of quick_stories).
// Clear passes are approved, clear breaches rejected, anything uncertain goes to the moderation console.
// Videos always go to a person in the console (frame-by-frame checks need a video pipeline).
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5';

const PHOTO_RULES = `You review profile photos for a UK dating app before they go live. Reply with JSON only:
{"decision":"approve"|"review"|"reject","reasons":[short strings]}
Reject: nudity or sexual content; anyone who looks under 18; violence or weapons; hate symbols; visible phone numbers, social handles, QR codes or payment links.
Review: no person visible; face hidden in every way; looks AI-generated or heavily filtered; looks like a celebrity, stock or model photo; screenshots; group photo where the main person is unclear.
Approve: otherwise. Never comment on attractiveness.`;

const STORY_RULES = `You review short "story" answers on a UK dating profile before they go live. Reply with JSON only:
{"decision":"approve"|"review"|"reject","reasons":[short strings]}
Reject: sexual content; hate or harassment; threats; contact details, social handles, links or payment requests; anything suggesting the writer is under 18.
Review: possible scam patterns (crypto, investments, asking to move off the app); anything you're unsure about.
Approve: otherwise, including jokes and mild swearing.`;

async function ask(system: string, content: unknown[]) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 200, system, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) return { decision: 'review', reasons: [`checker_unavailable_${res.status}`] };
  const out = await res.json();
  const text = (out.content ?? []).map((c: any) => c.text ?? '').join('');
  try {
    const j = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    return ['approve', 'review', 'reject'].includes(j.decision) ? j : { decision: 'review', reasons: ['unparsed'] };
  } catch { return { decision: 'review', reasons: ['unparsed'] }; }
}

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return new Response('Forbidden', { status: 403 });
  const { table, record } = await req.json();
  // Only check what is waiting for a check. Our own approve/reject below is an UPDATE that fires
  // the quick_stories webhook again; without this it would check the same story for ever.
  // (A member's edit sets moderation back to 'pending' through the story_recheck trigger.)
  if (record?.moderation && record.moderation !== 'pending') return Response.json({ id: record.id, skipped: 'already_checked' });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let verdict: { decision: string; reasons: string[] };

  if (table === 'quick_stories') {
    verdict = await ask(STORY_RULES, [{ type: 'text', text: `Prompt: ${record.prompt}\nAnswer: ${record.answer}` }]);
  } else if (table === 'media' && record.kind === 'photo') {
    const { data } = await db.storage.from('media').createSignedUrl(record.storage_path, 300);
    verdict = data?.signedUrl
      ? await ask(PHOTO_RULES, [{ type: 'image', source: { type: 'url', url: data.signedUrl } }, { type: 'text', text: `Caption: ${record.caption ?? '(none)'}` }])
      : { decision: 'review', reasons: ['no_file'] };
  } else {
    verdict = { decision: 'review', reasons: ['video_needs_a_person'] };
  }

  const moderation = verdict.decision === 'approve' ? 'approved' : verdict.decision === 'reject' ? 'rejected' : 'pending';
  if (moderation !== 'pending') await db.from(table).update({ moderation }).eq('id', record.id);
  await db.from('mod_actions').insert({ staff: null, action: `ai_${verdict.decision}`, target: record.id, note: verdict.reasons.join('; ').slice(0, 300) });
  return Response.json({ id: record.id, ...verdict });
});
