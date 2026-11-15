// Supabase Edge Function: three AI reply ideas for a conversation.
// Deploy: supabase functions deploy suggest-replies
// Secrets: supabase secrets set ANTHROPIC_API_KEY=... (optional ANTHROPIC_MODEL, default claude-haiku-5-5)
//
// Privacy rules enforced here:
// - only a member of the match can ask, and only if they have not switched AI ideas off
// - the other person's messages are sent to the model only if they opted in (consent ai_coach_content);
//   otherwise only the requester's own messages and both people's listed interests are used
// - nothing from the model is sent automatically: the app puts the idea in the composer to edit
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildSuggestPrompt, parseSuggestions, TONES, type Tone } from '../_shared/suggest.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'not_authenticated' }, 401);

    const { matchId, tone } = await req.json() as { matchId: string; tone: Tone };
    if (!(tone in TONES)) return json({ error: 'unknown_tone' }, 400);
    const { data: match } = await admin.from('matches').select('*').eq('id', matchId).maybeSingle();
    if (!match || ![match.user_a, match.user_b].includes(user.id) || match.status !== 'open') return json({ error: 'match_not_found' }, 404);
    const other = match.user_a === user.id ? match.user_b : match.user_a;

    const { data: consents } = await admin.from('consents').select('member, kind, granted').in('member', [user.id, other]);
    const consent = (who: string, kind: string) => consents?.find((c) => c.member === who && c.kind === kind)?.granted;
    if (consent(user.id, 'ai_coach') === false) return json({ error: 'ai_switched_off' }, 403);
    const theirsIncluded = consent(other, 'ai_coach_content') === true;

    const since = new Date(Date.now() - 864e5).toISOString();
    const { count } = await admin.from('ai_requests').select('member', { count: 'exact', head: true }).eq('member', user.id).gte('created_at', since);
    const { data: cap } = await admin.from('economy').select('value').eq('key', 'ai_suggestions_per_day').maybeSingle();
    if ((count ?? 0) >= (cap?.value ?? 40)) return json({ error: 'daily_limit_reached' }, 429);

    const { data: people } = await admin.from('profiles').select('id, first_name, interests').in('id', [user.id, other]);
    const me = people?.find((p) => p.id === user.id), them = people?.find((p) => p.id === other);
    const { data: rows } = await admin.from('messages').select('sender, body, kind').eq('match_id', matchId)
      .order('created_at', { ascending: false }).limit(24);
    const messages = (rows ?? []).reverse()
      .filter((m) => m.kind === 'text' && m.body && (m.sender === user.id || theirsIncluded))
      .map((m) => ({ mine: m.sender === user.id, text: m.body as string }));
    const mine = new Set((me?.interests ?? []).map((x: string) => x.toLowerCase()));
    const theirInterests: string[] = them?.interests ?? [];

    const { system, user: prompt } = buildSuggestPrompt({
      tone, myName: me?.first_name ?? 'Me', theirName: them?.first_name ?? 'them', level: match.level, messages, theirsIncluded,
      sharedInterests: theirInterests.filter((x) => mine.has(x.toLowerCase())), theirInterests,
    });
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-5-5', max_tokens: 400, system, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) return json({ error: 'ai_unavailable' }, 502);
    const out = await res.json();
    const text = (out.content ?? []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n');
    await admin.from('ai_requests').insert({ member: user.id, match_id: matchId });
    return json({ suggestions: parseSuggestions(text), usedTheirMessages: theirsIncluded });
  } catch (_e) {
    return json({ error: 'ai_unavailable' }, 500);
  }
});
