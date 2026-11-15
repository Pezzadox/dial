// Sends queued notifications (public.notifications) as push notifications through Expo's push service.
// Run it on a one-minute cron (pg_cron or a scheduler) so the 8pm drop goes out on time.
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (set automatically), and optionally
// EXPO_ACCESS_TOKEN if push security is enabled for the Expo project.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  // Only the webhook or cron (with the service role key) may call this.
  const auth = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (auth !== `Bearer ${serviceKey}`) return new Response('Forbidden', { status: 403 });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
  const { data: queued, error } = await db.from('notifications')
    .select('id, member, kind, title, body, data').is('sent_at', null)
    .lte('deliver_at', new Date().toISOString())                              // mutuals wait for the 8pm drop
    .gt('deliver_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())   // never send anything over an hour late
    .order('created_at').limit(500);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!queued?.length) return Response.json({ sent: 0 });

  const members = [...new Set(queued.map((n) => n.member))];
  const { data: tokens } = await db.from('push_tokens').select('token, member').in('member', members);
  const byMember = new Map<string, string[]>();
  for (const t of tokens ?? []) byMember.set(t.member, [...(byMember.get(t.member) ?? []), t.token]);

  const messages = queued.flatMap((n) => (byMember.get(n.member) ?? []).map((to) => ({
    to, title: n.title, body: n.body, sound: 'default', priority: n.kind === 'quick_mutual' ? 'high' : 'default',
    data: { ...n.data, kind: n.kind, notificationId: n.id },
  })));

  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        ...(Deno.env.get('EXPO_ACCESS_TOKEN') ? { Authorization: `Bearer ${Deno.env.get('EXPO_ACCESS_TOKEN')}` } : {}),
      },
      body: JSON.stringify(batch),
    });
    const out = await res.json().catch(() => ({}));
    (out.data ?? []).forEach((ticket: any, j: number) => {
      if (ticket?.details?.error === 'DeviceNotRegistered') dead.push(batch[j].to);
    });
  }
  if (dead.length) await db.from('push_tokens').delete().in('token', dead);
  await db.from('notifications').update({ sent_at: new Date().toISOString() }).in('id', queued.map((n) => n.id));
  return Response.json({ sent: messages.length, notifications: queued.length, removedTokens: dead.length });
});
