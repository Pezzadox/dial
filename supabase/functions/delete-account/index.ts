// Deletes the signed-in member's account: their files, then the account itself (every table
// cascades from it). Called from Quick Dial → You → Delete account.
// Deploy: supabase functions deploy delete-account
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'media';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const auth = req.headers.get('Authorization');
  if (!auth) return new Response('Unauthorised', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL')!;
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return new Response('Unauthorised', { status: 401 });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // 1. Keep the safety record (reports about this member), as the member.
    const prep = await user.rpc('prepare_account_deletion');
    if (prep.error) throw prep.error;

    // 2. Every file under media/<member id>/, however deep.
    const files: string[] = [];
    const walk = async (prefix: string) => {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset });
        if (error) throw error;
        for (const f of data ?? []) {
          const path = `${prefix}/${f.name}`;
          if (f.id) files.push(path); else await walk(path);   // folders have no id
        }
        if (!data || data.length < 1000) break;
      }
    };
    await walk(me.id);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(files.slice(i, i + 100));
      if (error) throw error;
    }

    // 3. The account. Profiles, media rows, Dials, chats, matches and push tokens cascade.
    const del = await admin.auth.admin.deleteUser(me.id);
    if (del.error) throw del.error;
    return Response.json({ deleted: true, files: files.length });
  } catch (e) {
    console.error('delete-account failed', me.id, e);
    return Response.json({ error: 'delete_failed' }, { status: 500 });
  }
});
