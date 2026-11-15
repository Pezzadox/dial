// Runs the migration on an embedded Postgres (PGlite) and checks the server rules.
// Usage (from app/): npm run test:db
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const db = new PGlite();

// Minimal stand-in for what Supabase provides.
await db.exec(`
  create role authenticated nologin; create role anon nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
`);
for (const f of ['0001_core.sql', '0002_engagement.sql', '0003_storage.sql', '0004_types.sql', '0005_dial_training.sql', '0006_dial_matching.sql', '0007_games.sql', '0008_safety.sql', '0009_quick_dial.sql', '0010_account_deletion.sql'])
  await db.exec(readFileSync(join(here, '../../supabase/migrations/' + f), 'utf8'));

let passed = 0;
const test = async (name, fn) => {
  try { await db.exec('reset role'); await fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.log('FAIL  ' + name + '\n      ' + e.message); process.exitCode = 1; }
  finally { await db.exec('reset role'); }
};
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const asUser = async (n, sql, params = []) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uuid(n)}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const admin = (sql, params = []) => db.query(sql, params);
const rejects = async (p, pattern) => {
  let err; try { await p; } catch (e) { err = e; }
  assert.ok(err, 'expected an error matching ' + pattern);
  assert.match(err.message, pattern);
};
const ink = async (n) => (await admin('select coalesce(sum(amount),0)::int s from ink_ledger where member=$1', [uuid(n)])).rows[0].s;

const makeUser = async (n, over = {}) => {
  const p = { first_name: 'User' + n, birth_date: '1995-05-05', gender: n % 2 ? 'woman' : 'man',
              interested_in: n % 2 ? '{man}' : '{woman}', interests: '{hiking,film}', intentions: 'relationship', ...over };
  await admin('insert into auth.users values ($1)', [uuid(n)]);
  await asUser(n, `insert into profiles (id, first_name, birth_date, gender, interested_in, interests, intentions, lat_coarse, lng_coarse, onboarded)
                   values ($1,$2,$3,$4,$5,$6,$7, 53.80, -1.55, true)`,
    [uuid(n), p.first_name, p.birth_date, p.gender, p.interested_in, p.interests, p.intentions]);
};
const addMedia = async (n, approved = true) => {
  const r = await asUser(n, `insert into media (owner, kind, storage_path) values ($1,'photo','p/' || gen_random_uuid()) returning id`, [uuid(n)]);
  if (approved) await admin(`update media set moderation='approved' where id=$1`, [r.rows[0].id]);
  return r.rows[0].id;
};
const match = async (a, b) => {
  await asUser(a, 'select like_profile($1)', [uuid(b)]);
  return (await asUser(b, 'select like_profile($1) id', [uuid(a)])).rows[0].id;
};

for (let n = 1; n <= 8; n++) await makeUser(n);

await test('under-18s cannot create a profile', async () => {
  await admin('insert into auth.users values ($1)', [uuid(99)]);
  await rejects(asUser(99, `insert into profiles (id, first_name, birth_date, gender) values ($1,'Kid', current_date - interval '17 years', 'man')`, [uuid(99)]), /check constraint/);
});

await test('members cannot read or write another member\'s profile row', async () => {
  await rejects(asUser(1, `insert into profiles (id, first_name, birth_date, gender) values ($1,'Fake','1990-01-01','man')`, [uuid(98)]), /row-level security|foreign key/);
  const r = await asUser(1, `update profiles set first_name='Hacked' where id=$1`, [uuid(2)]);
  assert.equal(r.affectedRows, 0);
});

let photo;
await test('power gauge: validation, own media and unapproved media are refused', async () => {
  photo = await addMedia(1);
  const pending = await addMedia(1, false);
  await rejects(asUser(1, 'select rate_media($1, 80)', [photo]), /cannot_rate_own_media/);
  await rejects(asUser(2, 'select rate_media($1, 101)', [photo]), /score_out_of_range/);
  await rejects(asUser(2, 'select rate_media($1, 60)', [pending]), /media_not_available/);
  await rejects(asUser(1, `update media set moderation='approved' where id=$1`, [pending]), /moderation_is_staff_only/);
});

await test('power gauge: average hidden until 5 raters, then shown to the owner only', async () => {
  const scores = { 2: 80, 3: 70, 4: 90, 5: 60 };
  for (const [n, s] of Object.entries(scores)) await asUser(+n, 'select rate_media($1, $2)', [photo, s]);
  let s = (await asUser(1, 'select * from my_media_stats() where media_id=$1', [photo])).rows[0];
  assert.equal(s.raters, 4); assert.equal(s.average_score, null);
  await asUser(6, 'select rate_media($1, 100)', [photo]);
  await asUser(6, 'select rate_media($1, 50)', [photo]);          // re-rating overwrites, does not add
  s = (await asUser(1, 'select * from my_media_stats() where media_id=$1', [photo])).rows[0];
  assert.equal(s.raters, 5); assert.equal(Number(s.average_score), 70);
  assert.equal(Number((await admin('select app.presentation_score($1) v', [uuid(1)])).rows[0].v), 70);
  // the owner cannot see who rated; a rater sees only their own rating
  assert.equal((await asUser(1, 'select * from media_ratings')).rows.length, 0);
  assert.equal((await asUser(2, 'select * from media_ratings')).rows.length, 1);
  await rejects(asUser(2, `insert into media_ratings (media_id, rater, score) values ($1,$2,100)`, [photo, uuid(2)]), /permission denied/);
});

await test('Ink cannot be written by a client', async () => {
  await rejects(asUser(1, `insert into ink_ledger (member, amount, reason, ref) values ($1, 9999, 'gift', 'x')`, [uuid(1)]), /permission denied/);
  await rejects(asUser(1, `select app.award($1, 9999, 'gift', 'x')`, [uuid(1)]), /permission denied/);
});

let m12;
await test('a match needs a like from both sides', async () => {
  assert.equal((await asUser(1, 'select like_profile($1, $2, $3) id', [uuid(2), null, 'Great photo'])).rows[0].id, null);
  m12 = (await asUser(2, 'select like_profile($1) id', [uuid(1)])).rows[0].id;
  assert.ok(m12);
  assert.equal((await asUser(3, 'select * from matches')).rows.length, 0);     // outsiders see nothing
  await rejects(asUser(3, 'select send_message($1, $2)', [m12, 'hi']), /match_not_found/);
});

await test('conversation levels and Ink follow what both people do', async () => {
  await asUser(1, 'select send_message($1, $2)', [m12, 'Hello there']);
  assert.equal(await ink(1), 0);                                   // nothing for an unanswered opener
  await asUser(2, 'select send_message($1, $2)', [m12, 'Hi! How was your weekend?']);
  assert.equal(await ink(1), 10);                                  // opener got a reply
  assert.equal(await ink(2), 0);
  // spamming one side does not level up
  for (let i = 0; i < 30; i++) await asUser(1, 'select send_message($1, $2)', [m12, 'spam ' + i]);
  assert.equal((await admin('select level from matches where id=$1', [m12])).rows[0].level, 1);
  // backfill a balanced exchange over three earlier days
  await admin(`delete from messages where match_id=$1 and body like 'spam%'`, [m12]);
  for (let d = 1; d <= 2; d++) for (let i = 0; i < 6; i++) for (const u of [1, 2])
    await admin(`insert into messages (match_id, sender, body, is_question, created_at) values ($1,$2,'msg',false, now() - ($3 || ' days')::interval)`, [m12, uuid(u), d]);
  await asUser(1, 'select send_message($1, $2)', [m12, 'What are you reading?']);
  assert.equal((await admin('select level from matches where id=$1', [m12])).rows[0].level, 3);
  await asUser(1, `select send_message($1, null, 'voice')`, [m12]);
  assert.equal((await admin('select level from matches where id=$1', [m12])).rows[0].level, 3);   // one-sided voice note
  await asUser(2, `select send_message($1, null, 'voice')`, [m12]);
  assert.equal((await admin('select level from matches where id=$1', [m12])).rows[0].level, 4);
  assert.equal((await asUser(1, 'select ready_to_meet($1) r', [m12])).rows[0].r, false);
  assert.equal((await asUser(2, 'select ready_to_meet($1) r', [m12])).rows[0].r, true);
  assert.equal((await admin('select level from matches where id=$1', [m12])).rows[0].level, 5);
  assert.equal(await ink(1), 10 + 10 + 20 + 30 + 40 + 15);
  assert.equal(await ink(2), 10 + 20 + 30 + 40 + 15);
  const p = (await asUser(2, 'select * from my_progress()')).rows[0];
  assert.equal(p.ink, 115); assert.equal(p.chapter, 1);
});

await test('conversation Ink stops at the weekly cap', async () => {
  await admin(`insert into ink_ledger (member, amount, reason, ref) values ($1, 290, 'conv_test_fill', 't')`, [uuid(3)]);
  assert.equal((await admin(`select app.award_conversation($1, 40, 'conv_level_5', 'cap-a') v`, [uuid(3)])).rows[0].v, 10);
  assert.equal((await admin(`select app.award_conversation($1, 40, 'conv_level_5', 'cap-b') v`, [uuid(3)])).rows[0].v, 0);
});

const runDate = async (a, b, m, enjoyedA = 5, enjoyedB = 4) => {
  const plan = (await asUser(a, `select propose_date($1, 'Coffee at North Star', now() + interval '2 days') id`, [m])).rows[0].id;
  await rejects(asUser(a, 'select respond_to_date($1, true)', [plan]), /cannot_respond_to_own_plan/);
  await asUser(b, 'select respond_to_date($1, true)', [plan]);
  await rejects(asUser(a, 'select confirm_date($1, true)', [plan]), /date_has_not_happened_yet/);
  await admin(`update date_plans set starts_at = now() - interval '3 hours' where id=$1`, [plan]);
  assert.equal((await asUser(a, 'select confirm_date($1, true) r', [plan])).rows[0].r, 'waiting');
  await rejects(asUser(a, 'select submit_date_feedback($1,5,5,5,5,5)', [plan]), /date_not_confirmed/);
  assert.equal((await asUser(b, 'select confirm_date($1, true) r', [plan])).rows[0].r, 'recorded');
  await asUser(a, 'select submit_date_feedback($1,$2,5,5,5,5)', [plan, enjoyedA]);
  await asUser(b, 'select submit_date_feedback($1,$2,4,4,4,4)', [plan, enjoyedB]);
  return plan;
};

await test('dates: both must confirm; pair earns full, half, then nothing', async () => {
  await admin(`update matches set created_at = now() - interval '10 days' where id=$1`, [m12]);
  const before1 = await ink(1), before2 = await ink(2);
  await runDate(1, 2, m12);
  assert.equal(await ink(1) - before1, 250); assert.equal(await ink(2) - before2, 250);
  await runDate(2, 1, m12);
  assert.equal(await ink(1) - before1, 250 + 125);
  // a third date in the same week is beyond the weekly limit and beyond the pair limit
  await runDate(1, 2, m12);
  assert.equal(await ink(1) - before1, 375); assert.equal(await ink(2) - before2, 375);
  // feedback is private: each person reads back only their own
  assert.equal((await asUser(1, 'select * from date_feedback')).rows.every(r => r.member === uuid(1)), true);
  assert.equal((await asUser(1, 'select * from date_confirmations')).rows.every(r => r.member === uuid(1)), true);
});

await test('dates: lukewarm feedback pays no bonus and takes nothing away', async () => {
  const m = await match(3, 4);
  await admin(`update matches set created_at = now() - interval '10 days' where id=$1`, [m]);
  const before = await ink(4);
  await runDate(3, 4, m, 5, 2);
  assert.equal(await ink(4) - before, 200);
});

await test('dates: one "no" pays nothing; a date an hour after matching is held for review', async () => {
  const m = await match(5, 6);
  const plan = (await asUser(5, `select propose_date($1, 'Park', now() + interval '1 day') id`, [m])).rows[0].id;
  await asUser(6, 'select respond_to_date($1, true)', [plan]);
  await admin(`update date_plans set starts_at = now() - interval '1 minute' where id=$1`, [plan]);
  await asUser(5, 'select confirm_date($1, true)', [plan]);
  await asUser(6, 'select confirm_date($1, true)', [plan]);
  assert.equal((await admin('select status from date_plans where id=$1', [plan])).rows[0].status, 'held_for_review');
  assert.equal(await ink(5), 0);
  const m2 = await match(7, 8);
  await admin(`update matches set created_at = now() - interval '10 days' where id=$1`, [m2]);
  const plan2 = (await asUser(7, `select propose_date($1, 'Gallery', now() + interval '1 day') id`, [m2])).rows[0].id;
  await asUser(8, 'select respond_to_date($1, true)', [plan2]);
  await admin(`update date_plans set starts_at = now() - interval '1 day' where id=$1`, [plan2]);
  await asUser(7, 'select confirm_date($1, true)', [plan2]);
  assert.equal((await asUser(8, 'select confirm_date($1, false) r', [plan2])).rows[0].r, 'recorded');
  assert.equal(await ink(7), 0);
});

await test('feeling unsafe files a report and stays out of scoring', async () => {
  const m = (await admin('select id from matches where user_a=$1 and user_b=$2', [uuid(3), uuid(4)])).rows[0].id;
  const plan = (await asUser(3, `select propose_date($1, 'Walk', now() + interval '1 day') id`, [m])).rows[0].id;
  await asUser(4, 'select respond_to_date($1, true)', [plan]);
  await admin(`update date_plans set starts_at = now() - interval '1 day' where id=$1`, [plan]);
  await asUser(3, 'select confirm_date($1, true)', [plan]); await asUser(4, 'select confirm_date($1, true)', [plan]);
  await asUser(4, 'select submit_date_feedback($1,1,1,1,1,1,true)', [plan]);
  const r = (await admin(`select * from reports where reason='felt_unsafe_on_date'`)).rows;
  assert.equal(r.length, 1); assert.equal(r[0].reporter, uuid(4)); assert.equal(r[0].reported, uuid(3));
  assert.equal((await asUser(3, 'select * from reports')).rows.length, 0);   // the reported person cannot see it
});

await test('eight open conversations; the ninth waits until one is closed kindly', async () => {
  for (let n = 20; n <= 28; n++) await makeUser(n, { gender: 'man', interested_in: '{woman}' });
  await makeUser(31, { gender: 'woman', interested_in: '{man}' });
  const ids = [];
  for (let n = 20; n <= 28; n++) ids.push(await match(31, n));
  const st = (await admin('select status from matches where id = any($1) order by created_at', [ids])).rows.map(r => r.status);
  assert.deepEqual(st, [...Array(8).fill('open'), 'queued']);
  await rejects(asUser(28, 'select send_message($1, $2)', [ids[8], 'hi']), /conversation_not_open/);
  await asUser(31, 'select close_match($1, $2)', [ids[0], 'Lovely chatting, good luck!']);
  assert.equal((await admin('select status from matches where id=$1', [ids[8]])).rows[0].status, 'open');
  assert.equal((await admin('select status from matches where id=$1', [ids[0]])).rows[0].status, 'closed');
});

await test('introductions respect preferences, blocks and existing likes', async () => {
  await makeUser(40, { gender: 'woman', interested_in: '{man}' });
  await makeUser(41, { gender: 'man', interested_in: '{woman}', interests: '{hiking,jazz}' });
  await makeUser(42, { gender: 'man', interested_in: '{man}' });
  await makeUser(43, { gender: 'man', interested_in: '{woman}' });
  await asUser(40, 'insert into blocks (blocker, blocked) values ($1,$2)', [uuid(40), uuid(43)]);
  const rows = (await asUser(40, 'select * from get_introductions(25)')).rows;
  const got = rows.map(r => r.id);
  assert.ok(got.includes(uuid(41)));
  assert.ok(!got.includes(uuid(42)) && !got.includes(uuid(43)) && !got.includes(uuid(40)));
  assert.equal(rows.find(r => r.id === uuid(41)).shared_interests, 1);
  assert.ok(!('lat_coarse' in rows[0]));                      // no coordinates leave the server
  await asUser(40, 'select like_profile($1)', [uuid(41)]);
  assert.ok(!(await asUser(40, 'select * from get_introductions(25)')).rows.map(r => r.id).includes(uuid(41)));
  assert.equal((await asUser(43, 'select id from profiles where id=$1', [uuid(40)])).rows.length, 0);  // blocked both ways
});

await test('likes inbox shows who liked what, and clears on like back or pass', async () => {
  await makeUser(50, { gender: 'woman', interested_in: '{man}' });
  await makeUser(51, { gender: 'man', interested_in: '{woman}' });
  await makeUser(52, { gender: 'man', interested_in: '{woman}' });
  const pic = await addMedia(50);
  await asUser(51, 'select like_profile($1, $2, $3)', [uuid(50), pic, 'Where was this taken?']);
  await asUser(52, 'select like_profile($1)', [uuid(50)]);
  let inbox = (await asUser(50, 'select * from incoming_likes()')).rows;
  assert.equal(inbox.length, 2);
  const l51 = inbox.find((r) => r.from_id === uuid(51));
  assert.equal(l51.media_id, pic); assert.equal(l51.comment, 'Where was this taken?');
  assert.equal((await asUser(51, 'select * from incoming_likes()')).rows.length, 0);   // senders see nothing here
  await asUser(50, 'select pass_profile($1)', [uuid(52)]);
  const mid = (await asUser(50, 'select like_profile($1) id', [uuid(51)])).rows[0].id;
  inbox = (await asUser(50, 'select * from incoming_likes()')).rows;
  assert.equal(inbox.length, 0);
  const first = (await asUser(50, 'select sender, body from messages where match_id = $1', [mid])).rows;
  assert.deepEqual(first, [{ sender: uuid(51), body: 'Where was this taken?' }]);   // the comment opens the chat
  await makeUser(53, { gender: 'man', interested_in: '{woman}' });
  await asUser(50, 'select pass_profile($1)', [uuid(53)]);
  assert.ok(!(await asUser(50, 'select id from get_introductions(25)')).rows.map((r) => r.id).includes(uuid(53)));
});

await test('media uploads start pending unless the alpha switch is on', async () => {
  const a = (await asUser(50, `insert into media (owner, kind, storage_path, moderation) values ($1,'photo','x/1','approved') returning moderation`, [uuid(50)])).rows[0];
  assert.equal(a.moderation, 'pending');                    // a member cannot self-approve on insert
  await admin(`update economy set value = 1 where key = 'auto_approve_media'`);
  const b = (await asUser(50, `insert into media (owner, kind, storage_path) values ($1,'photo','x/2') returning moderation`, [uuid(50)])).rows[0];
  assert.equal(b.moderation, 'approved');
  await admin(`update economy set value = 0 where key = 'auto_approve_media'`);
  await rejects(asUser(51, `insert into media (owner, kind, storage_path) values ($1,'photo','x/3')`, [uuid(50)]), /row-level security/);
});

await test('assessments validate traits, update the profile and pay once', async () => {
  await rejects(asUser(51, `select submit_assessment('personality', '{"humour": 1.4}')`), /invalid_traits/);
  await rejects(asUser(51, `select submit_assessment('personality', '{"wealth": 0.5}')`), /invalid_traits/);
  await rejects(asUser(51, `select submit_assessment('astrology', '{}')`), /unknown_assessment/);
  const before = await ink(51);
  assert.equal((await asUser(51, `select submit_assessment('personality', '{"humour": 0.8, "planner": 0.3}') v`)).rows[0].v, 100);
  assert.equal((await asUser(51, `select submit_assessment('personality', '{"humour": 0.6}') v`)).rows[0].v, 0);
  assert.equal(await ink(51) - before, 100);
  const t = (await admin('select traits from profiles where id=$1', [uuid(51)])).rows[0].traits;
  assert.equal(t.humour, 0.6); assert.equal(t.planner, 0.3);
});

await test('challenges are verified from activity and pay once per day', async () => {
  await rejects(asUser(52, `select claim_challenge('voice_note')`), /challenge_not_done/);
  await rejects(asUser(52, `select claim_challenge('free_money')`), /unknown_challenge/);
  const m = (await admin('select id from matches where user_a=$1 and user_b=$2', [uuid(1), uuid(2)])).rows[0].id;
  await asUser(1, `select send_message($1, null, 'voice')`, [m]);
  await asUser(1, `select send_message($1, 'What are you up to?')`, [m]);
  const before = await ink(1);
  assert.equal((await asUser(1, `select claim_challenge('voice_note') v`)).rows[0].v, 15);
  assert.equal((await asUser(1, `select claim_challenge('ask_question') v`)).rows[0].v, 0);   // one daily pays
  assert.equal((await asUser(1, `select claim_challenge('move_forward') v`)).rows[0].v, 50);  // levelled up this week
  assert.equal((await asUser(1, `select claim_challenge('move_forward') v`)).rows[0].v, 0);
  assert.equal(await ink(1) - before, 65);
  const list = (await asUser(1, 'select * from my_challenges()')).rows;
  assert.ok(list.find((c) => c.code === 'ask_question').done);
  assert.ok(list.find((c) => c.code === 'ask_question').claimed);
});

await test('weekly board is opt-in and shows only first name and Chapter', async () => {
  assert.equal((await asUser(1, 'select * from weekly_board()')).rows.length, 0);
  await asUser(1, `insert into consents (member, kind, granted) values ($1, 'leaderboards', true)`, [uuid(1)]);
  await asUser(2, `insert into consents (member, kind, granted) values ($1, 'leaderboards', true)`, [uuid(2)]);
  const rows = (await asUser(2, 'select * from weekly_board()')).rows;
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['chapter', 'first_name', 'ink', 'is_me', 'rank']);
  assert.equal(rows[0].first_name, 'User1');                 // User1 earned more this week
  assert.equal(rows.find((r) => r.is_me).first_name, 'User2');
  assert.ok(!(await asUser(3, 'select * from weekly_board()')).rows.some((r) => r.first_name === 'User3'));
});

await test('ideal partner answers stay private but still drive matching', async () => {
  await makeUser(60, { gender: 'woman', interested_in: '{man}' });
  await makeUser(61, { gender: 'man', interested_in: '{woman}' });
  await makeUser(62, { gender: 'man', interested_in: '{woman}' });
  await rejects(asUser(60, `select submit_ideal_partner('{"planner": 2}')`), /invalid_traits/);
  assert.equal((await asUser(60, `select submit_ideal_partner('{"planner": 0.9, "humour": 0.8}') v`)).rows[0].v, 50);
  assert.equal((await asUser(60, `select submit_ideal_partner('{"planner": 0.9, "humour": 0.8}') v`)).rows[0].v, 0);
  await admin(`update profiles set traits = '{"planner": 0.9, "humour": 0.7}' where id = $1`, [uuid(61)]);
  await admin(`update profiles set traits = '{"planner": 0.1, "humour": 0.2}' where id = $1`, [uuid(62)]);
  // 61 and 62 see how well they fit 60's ideal, never the answers themselves
  const fit61 = Number((await asUser(61, 'select fits_their_ideal f from get_introductions(25) where id = $1', [uuid(60)])).rows[0].f);
  const fit62 = Number((await asUser(62, 'select fits_their_ideal f from get_introductions(25) where id = $1', [uuid(60)])).rows[0].f);
  assert.equal(fit61, 0.95); assert.equal(fit62, 0.3);
  await rejects(asUser(61, 'select ideal_traits from profiles where id = $1', [uuid(60)]), /permission denied/);
  await rejects(asUser(61, 'select * from profiles'), /permission denied/);
  assert.equal((await asUser(60, 'select my_ideal_traits() t')).rows[0].t.planner, 0.9);
});

await test('top three types are private and limited to three vibes', async () => {
  await asUser(60, `insert into ideal_types (member, rank, hair_colours, eye_colours, builds, vibes) values ($1, 1, '{brunette,black}', '{blue}', '{curvy}', '{warm}')`, [uuid(60)]);
  await asUser(60, `insert into ideal_types (member, rank, hair_colours, eye_colours, builds, vibes) values ($1, 2, '{red}', '{green}', '{athletic}', '{sporty}')`, [uuid(60)]);
  await rejects(asUser(60, `insert into ideal_types (member, rank) values ($1, 4)`, [uuid(60)]), /check constraint/);
  await rejects(asUser(60, `insert into ideal_types (member, rank, vibes) values ($1, 3, '{a,b,c,d}')`, [uuid(60)]), /check constraint/);
  assert.equal((await asUser(61, 'select * from ideal_types')).rows.length, 0);
  await rejects(asUser(61, `insert into ideal_types (member, rank) values ($1, 1)`, [uuid(60)]), /row-level security/);
});

await test('the Dial makes matches: 70+ both ways, notes open the chat, low scores stay private', async () => {
  await admin(`update profiles set hair_colour = 'red', eye_colour = 'green', build = 'athletic' where id = $1`, [uuid(61)]);
  await admin(`update profiles set hair_colour = 'blonde', eye_colour = 'blue', build = 'slim' where id = $1`, [uuid(62)]);
  await rejects(asUser(60, 'select dial_profile($1, 0)', [uuid(61)]), /score_out_of_range/);
  await rejects(asUser(60, 'select dial_profile($1, 80)', [uuid(60)]), /cannot_dial_self/);
  // 60 dials 61 up with a note: no match yet, 61 sees "dialled you" with the note but not the number
  assert.equal((await asUser(60, 'select dial_profile($1, 88, $2) m', [uuid(61), 'That climbing photo, where is it?'])).rows[0].m, null);
  const inbox = (await asUser(61, 'select * from incoming_likes()')).rows;
  assert.equal(inbox.length, 1); assert.equal(inbox[0].comment, 'That climbing photo, where is it?');
  await rejects(asUser(61, 'select score from profile_dials where member = $1', [uuid(60)]).then((r) => { if (r.rows.length === 0) throw new Error('hidden'); }), /hidden/);
  // 61 dials back 74: a match, and the note is the first message
  const m = (await asUser(61, 'select dial_profile($1, 74) m', [uuid(60)])).rows[0].m;
  assert.ok(m);
  assert.deepEqual((await asUser(60, 'select body from messages where match_id = $1', [m])).rows.map((r) => r.body), ['That climbing photo, where is it?']);
  // a low Dial creates nothing and removes them from introductions
  assert.equal((await asUser(60, 'select dial_profile($1, 25) m', [uuid(62)])).rows[0].m, null);
  assert.equal((await asUser(62, 'select * from incoming_likes()')).rows.length, 0);
  assert.ok(!(await asUser(60, 'select id from get_introductions(25)')).rows.some((r) => r.id === uuid(62)));
  // 62 dialling 60 up does not match, because 60 dialled 62 low
  assert.equal((await asUser(62, 'select dial_profile($1, 95) m', [uuid(60)])).rows[0].m, null);
  // your type is learned from your Dials
  const learned = (await asUser(60, 'select * from my_learned_type()')).rows;
  assert.equal(Number(learned.find((r) => r.dimension === 'hair' && r.value === 'red').avg_score), 88);
  assert.equal(Number(learned.find((r) => r.dimension === 'hair' && r.value === 'blonde').avg_score), 25);
});

await test('games: both pick privately, rounds reveal only when both have picked, finishing counts for Level 4', async () => {
  await makeUser(70, { gender: 'woman', interested_in: '{man}' });
  await makeUser(71, { gender: 'man', interested_in: '{woman}' });
  const m = await match(70, 71);
  const rounds = JSON.stringify([{ prompt: 'Where?', options: ['Rooftop', 'Gallery'] }, { prompt: 'When?', options: ['Sunset', 'Brunch', 'Late'] }]);
  await rejects(asUser(3, 'select start_game($1, $2, $3)', [m, 'build_a_date', rounds]), /match_not_found/);
  await rejects(asUser(70, 'select start_game($1, $2, $3)', [m, 'build_a_date', JSON.stringify([{ prompt: 'x', options: ['one'] }])]), /invalid_game/);
  const g = (await asUser(70, 'select start_game($1, $2, $3) id', [m, 'build_a_date', rounds])).rows[0].id;
  await rejects(asUser(70, 'select play_game($1, 1, 0)', [g]), /invalid_round/);        // in order
  await rejects(asUser(70, 'select play_game($1, 0, 5)', [g]), /invalid_option/);
  await asUser(70, 'select play_game($1, 0, 1)', [g]);
  await asUser(70, 'select play_game($1, 0, 0)', [g]);                                    // cannot change a pick
  // 71 cannot see 70's pick before picking
  let view = (await asUser(71, 'select * from my_games($1)', [m])).rows[0];
  assert.deepEqual(view.their_picks, {}); assert.deepEqual(view.my_picks, {});
  await asUser(71, 'select play_game($1, 0, 1)', [g]);
  view = (await asUser(71, 'select * from my_games($1)', [m])).rows[0];
  assert.deepEqual(view.their_picks, { '0': 1 }); assert.deepEqual(view.my_picks, { '0': 1 });
  assert.equal((await asUser(3, 'select * from my_games($1)', [m])).rows.length, 0);    // outsiders see nothing
  await rejects(asUser(70, 'select * from games'), /permission denied/);
  // bring the conversation to Level 3, then finishing the game takes it to Level 4
  for (let d = 1; d <= 3; d++) for (let i = 0; i < 5; i++) for (const u of [70, 71])
    await admin(`insert into messages (match_id, sender, body, is_question, created_at) values ($1,$2,'hi?',true, now() - ($3 || ' days')::interval)`, [m, uuid(u), d]);
  await asUser(70, 'select send_message($1, $2)', [m, 'Shall we finish the game?']);
  assert.equal((await admin('select level from matches where id=$1', [m])).rows[0].level, 3);
  await asUser(70, 'select play_game($1, 1, 0)', [g]);
  await asUser(71, 'select play_game($1, 1, 2)', [g]);
  assert.equal((await admin('select status from games where id=$1', [g])).rows[0].status, 'complete');
  assert.equal((await admin('select level from matches where id=$1', [m])).rows[0].level, 4);
  await rejects(asUser(71, 'select play_game($1, 1, 1)', [g]), /game_over/);
});

await test('report and block: reporting blocks by default, closes the chat, hides both people, stays anonymous', async () => {
  await makeUser(80, { gender: 'woman', interested_in: '{man}' });
  await makeUser(81, { gender: 'man', interested_in: '{woman}' });
  await makeUser(82, { gender: 'man', interested_in: '{woman}' });
  const m = await match(80, 81);
  await rejects(asUser(80, 'select report_member($1, $2)', [uuid(80), 'spam_or_scam']), /cannot_report_self/);
  await rejects(asUser(80, 'select report_member($1, $2)', [uuid(81), 'made_up']), /unknown_reason/);
  const r1 = (await asUser(80, 'select report_member($1, $2, $3) id', [uuid(81), 'harassment', 'Kept messaging after I said no'])).rows[0].id;
  const r2 = (await asUser(80, 'select report_member($1, $2, $3) id', [uuid(81), 'harassment', 'And again'])).rows[0].id;
  assert.equal(r1, r2);                                                                  // one open report per pair
  assert.equal((await admin('select status from matches where id=$1', [m])).rows[0].status, 'closed');
  await rejects(asUser(81, 'select send_message($1, $2)', [m, 'hello?']), /conversation_not_open/);
  assert.equal((await asUser(81, 'select * from reports')).rows.length, 0);              // the reported member never sees it
  assert.equal((await asUser(80, 'select * from my_blocks()')).rows[0].first_name, 'User81');
  await asUser(82, 'select block_member($1)', [uuid(80)]);
  assert.ok(!(await asUser(82, 'select * from get_introductions()')).rows.some((r) => r.id === uuid(80)));
  await asUser(82, 'select unblock_member($1)', [uuid(80)]);
  assert.ok((await asUser(82, 'select * from get_introductions()')).rows.some((r) => r.id === uuid(80)));
  await rejects(asUser(80, 'select * from suspensions'), /permission denied/);
});

await test('moderation: staff only; upholding with a suspension hides the member from everyone; media review', async () => {
  await makeUser(90, { gender: 'woman', interested_in: '{man}' });
  await makeUser(91, { gender: 'man', interested_in: '{woman}' });
  await makeUser(92, { gender: 'woman', interested_in: '{man}' });
  const r = (await asUser(90, 'select report_member($1, $2, null, false) id', [uuid(91)].concat(['fake_profile']))).rows[0].id;
  await rejects(asUser(90, 'select * from mod_reports()'), /staff_only/);
  await rejects(asUser(90, 'select mod_resolve_report($1, $2, 7)', [r, 'upheld']), /staff_only/);
  assert.equal((await asUser(90, 'select am_i_staff() s')).rows[0].s, false);
  await admin('insert into staff values ($1)', [uuid(92)]);
  const queue = (await asUser(92, 'select * from mod_reports()')).rows;
  assert.ok(queue.some((q) => q.report_id === r && q.reported_name === 'User91'));
  assert.ok((await asUser(90, 'select * from get_introductions()')).rows.some((x) => x.id === uuid(91)));
  await asUser(92, 'select mod_resolve_report($1, $2, 7)', [r, 'upheld']);
  assert.equal((await admin('select status from reports where id=$1', [r])).rows[0].status, 'upheld');
  assert.ok(!(await asUser(90, 'select * from get_introductions()')).rows.some((x) => x.id === uuid(91)));
  await asUser(92, 'select mod_lift_suspension($1)', [uuid(91)]);
  assert.ok((await asUser(90, 'select * from get_introductions()')).rows.some((x) => x.id === uuid(91)));
  const media = await addMedia(91, false);
  assert.ok((await asUser(92, 'select * from mod_media_queue()')).rows.some((x) => x.media_id === media));
  await asUser(92, 'select mod_review_media($1, false)', [media]);
  assert.equal((await admin('select moderation from media where id=$1', [media])).rows[0].moderation, 'rejected');
  await rejects(asUser(92, 'select mod_review_media($1, true)', [media]), /media_not_pending/);
  assert.equal((await admin('select count(*)::int c from mod_actions')).rows[0].c, 3);
});

await test('about you: members edit their own words, within limits', async () => {
  await makeUser(95);
  await asUser(95, 'select save_about($1,$2,$3,$4,$5)', ['  Tea first.  ', 'Nurse', 'Leeds', 'something serious', '{Film, Film ,Hiking}']);
  const p = (await admin('select bio, occupation, interests from profiles where id=$1', [uuid(95)])).rows[0];
  assert.equal(p.bio, 'Tea first.'); assert.equal(p.occupation, 'Nurse'); assert.deepEqual([...p.interests].sort(), ['Film', 'Hiking']);
  await rejects(asUser(95, 'select save_about($1,$2,$3,$4,$5)', ['', '', '', '', '{a,b,c,d,e,f,g,h,i}']), /too_many_interests/);
});

// A full Quick set: 5 photos, a talking video, 5 stories, verified.
const quickReady = async (n, verified = true) => {
  const items = [];
  for (let i = 0; i < 5; i++) items.push(await addMedia(n));
  const v = await asUser(n, `insert into media (owner, kind, video_role, storage_path) values ($1,'video','intro','v/' || gen_random_uuid()) returning id`, [uuid(n)]);
  await admin(`update media set moderation='approved' where id=$1`, [v.rows[0].id]); items.push(v.rows[0].id);
  for (let i = 1; i <= 5; i++) {
    const st = await asUser(n, 'insert into quick_stories (owner, position, prompt, answer) values ($1,$2,$3,$4) returning id', [uuid(n), i, 'My most useless talent', 'I can name any Beatles song in three notes ' + i]);
    items.push(st.rows[0].id);
  }
  await admin(`update quick_stories set moderation='approved' where owner=$1`, [uuid(n)]);
  if (verified) await admin('update profiles set verified_at=now(), age_verified_at=now() where id=$1', [uuid(n)]);
  return items;   // 5 photos, video, 5 stories
};
const dialAll = async (rater, items, scores) => { let r; for (let i = 0; i < items.length; i++) r = (await asUser(rater, 'select quick_dial($1, $2) r', [items[i], scores[i]])).rows[0].r; return r; };

await test('quick dial: 11 Dials make a weighted score; mutual only when both high; numbers stay private', async () => {
  await makeUser(101, { gender: 'woman', interested_in: '{man}' });
  await makeUser(102, { gender: 'man', interested_in: '{woman}' });
  await makeUser(103, { gender: 'man', interested_in: '{woman}' });
  await makeUser(106, { gender: 'man', interested_in: '{woman}' });
  const it = { 101: await quickReady(101), 102: await quickReady(102), 103: await quickReady(103), 106: await quickReady(106, false) };
  // Members can't verify themselves; unverified people aren't shown
  await rejects(asUser(106, 'update profiles set verified_at=now() where id=$1', [uuid(106)]), /verification_is_set_by_the_provider/);
  const deck = (await asUser(101, 'select * from quick_deck()')).rows;
  assert.ok(deck.some((d) => d.id === uuid(102)) && !deck.some((d) => d.id === uuid(106)));
  const d102 = deck.find((d) => d.id === uuid(102));
  assert.deepEqual(d102.items.map((x) => x.kind), ['photo','photo','photo','photo','photo','video','story','story','story','story','story']);
  assert.equal(d102.items[6].prompt, 'My most useless talent');
  // Story edits go back for checking
  await asUser(102, 'update quick_stories set answer=$2 where owner=$1 and position=1', [uuid(102), 'Changed it']);
  assert.ok(!(await asUser(101, 'select * from quick_deck()')).rows.some((d) => d.id === uuid(102)));
  await admin(`update quick_stories set moderation='approved' where owner=$1`, [uuid(102)]);
  await rejects(asUser(101, 'select quick_dial($1, 101)', [it[102][0]]), /score_out_of_range/);
  await rejects(asUser(101, 'select quick_dial($1, 50)', [it[101][0]]), /cannot_dial_self/);
  // Looks 60, vibe 80, personality 90 → 0.4*60 + 0.2*80 + 0.4*90 = 76
  let r = await dialAll(101, it[102], [60,60,60,60,60, 80, 90,90,90,90,90]);
  assert.deepEqual(r, { complete: true, score: 76, looks: 60, vibe: 80, personality: 90, mutual: false });
  await dialAll(101, it[103], Array(11).fill(30));
  await rejects(asUser(101, 'select quick_dial($1, 99)', [it[103][0]]), /already_scored/);
  // One message until they reply
  await asUser(103, 'select quick_send($1, $2)', [uuid(101), 'Hello!']);
  await rejects(asUser(103, 'select quick_send($1, $2)', [uuid(101), 'Hello??']), /wait_for_reply/);
  const today = (await asUser(101, 'select used, allowance, tier from quick_today()')).rows[0];
  assert.deepEqual(today, { used: 2, allowance: 5, tier: 'free' });
  // 102 sees 101 first (101 dialled them high), dials back high: mutual
  assert.equal((await asUser(102, 'select * from quick_deck()')).rows[0].id, uuid(101));
  r = await dialAll(102, it[101], Array(11).fill(72));
  assert.equal(r.mutual, true);
  // 102 hears now; 101 (who dialled earlier) hears at the 8pm drop, and sees the mutual only then
  const n = (await admin(`select member, deliver_at > now() later from notifications where kind='quick_mutual' order by member`)).rows;
  assert.deepEqual(n.map((x) => [x.member, x.later]), [[uuid(101), true], [uuid(102), false]]);
  assert.equal((await asUser(101, 'select * from quick_card()')).rows[0].mutual, false);
  assert.equal((await asUser(102, 'select * from quick_card()')).rows[0].mutual, true);
  await admin(`update notifications set deliver_at = now() - interval '1 minute' where member=$1`, [uuid(101)]);
  const card = (await asUser(101, 'select * from quick_card()')).rows;
  assert.equal(card[0].first_name, 'User102'); assert.equal(card[0].mutual, true); assert.equal(card[0].personality, 90);
  // Nobody reads individual scores they were given
  assert.equal((await asUser(102, 'select * from quick_scores where subject=$1', [uuid(102)])).rows.length, 0);
  assert.equal((await asUser(102, 'select * from quick_dials where subject=$1', [uuid(102)])).rows.length, 0);
  const chats = (await asUser(101, 'select * from quick_chats()')).rows;
  assert.equal(chats[0].mutual, true); assert.equal(chats.find((c) => c.other === uuid(103)).last_body, 'Hello!');
  // Allowance used up → refused; an extra round lifts it
  await makeUser(104, { gender: 'man', interested_in: '{woman}' }); await makeUser(105, { gender: 'man', interested_in: '{woman}' });
  const i104 = await quickReady(104), i105 = await quickReady(105);
  await dialAll(101, i104, Array(11).fill(50));
  await admin(`update economy set value=3 where key='quick_people_per_day'`);      // test the limit at 3
  await rejects(asUser(101, 'select quick_dial($1, 50)', [i105[0]]), /daily_limit/);
  await admin('insert into quick_extra_rounds (member, rounds) values ($1, 1)', [uuid(101)]);
  await asUser(101, 'select quick_dial($1, 50)', [i105[0]]);
  await admin(`update economy set value=5 where key='quick_people_per_day'`);
  // Location: shown in whole miles; people outside either person's distance aren't shown
  await makeUser(107, { gender: 'man', interested_in: '{woman}' }); await makeUser(108, { gender: 'man', interested_in: '{woman}' });
  await quickReady(107); await quickReady(108);
  await asUser(101, 'select set_location($1, $2)', [53.80095, -1.54907]);      // Leeds
  await asUser(107, 'select set_location($1, $2)', [53.9591, -1.0815]);        // York, ~22 miles
  await asUser(108, 'select set_location($1, $2)', [51.5072, -0.1276]);        // London, ~170 miles
  assert.equal(Number((await admin('select lat_coarse from profiles where id=$1', [uuid(101)])).rows[0].lat_coarse), 53.8);
  await asUser(101, 'select set_max_distance(30)');
  let near = (await asUser(101, 'select id, miles from quick_deck()')).rows;
  assert.ok(near.some((x) => x.id === uuid(107) && x.miles >= 20 && x.miles <= 25));
  assert.ok(!near.some((x) => x.id === uuid(108)));
  await asUser(107, 'select set_max_distance(10)');                            // York only wants 10 miles
  assert.ok(!(await asUser(101, 'select id from quick_deck()')).rows.some((x) => x.id === uuid(107)));
  // Photobooth selfies appear on the deck once approved
  await asUser(102, `insert into quick_booth (owner, position, storage_path) values ($1, 1, 'b/1'), ($1, 2, 'b/2')`, [uuid(102)]);
  await asUser(102, 'select set_location($1, $2)', [53.79, -1.54]);
  await admin(`update quick_booth set moderation='approved' where owner=$1 and position=1`, [uuid(102)]);
  // Blocks hide the connection and stop messages
  await asUser(101, 'select block_member($1)', [uuid(103)]);
  await rejects(asUser(103, 'select quick_send($1, $2)', [uuid(101), 'Hi again']), /not_available/);
  assert.ok(!(await asUser(101, 'select * from quick_chats()')).rows.some((c) => c.other === uuid(103)));
});

await test('quick dial: selective diallers match at the top of their own range; fair decks; who dialled you', async () => {
  await makeUser(140, { gender: 'woman', interested_in: '{man}' });
  const her = await quickReady(140);
  const men = [];
  for (let k = 141; k <= 145; k++) { await makeUser(k, { gender: 'man', interested_in: '{woman}' }); men.push({ k, items: await quickReady(k) }); }
  // She's selective: 30, 35, 40, then 62 (her best by far, but under 70)
  for (const [i, sc] of [30, 35, 40].entries()) await dialAll(140, men[i].items, Array(11).fill(sc));
  // 144 dialled her 80 earlier; she gives him 62: top of her range, so it's a mutual
  await dialAll(144, her, Array(11).fill(80));
  // He shows first in her deck, marked (plans aren't live, so everyone gets the perk)
  const deck = (await asUser(140, 'select * from quick_deck()')).rows;
  assert.equal(deck[0].id, uuid(144)); assert.equal(deck[0].dialled_you, true); assert.equal(deck[0].hidden_admirers, 0);
  const r = await dialAll(140, men[3].items, Array(11).fill(62));
  assert.equal(r.mutual, true);
  // Once plans are live, free members see that someone in the ten dialled them high, but not who
  await makeUser(146, { gender: 'man', interested_in: '{woman}' }); await quickReady(146);
  await dialAll(146, her, Array(11).fill(90));
  await admin(`update economy set value=1 where key='quick_plans_live'`);
  const d2 = (await asUser(140, 'select * from quick_deck()')).rows;
  assert.equal(d2[0].dialled_you, null); assert.equal(d2[0].hidden_admirers, 1);
  await admin(`update economy set value=0 where key='quick_plans_live'`);
});

await test('quick dial: your own Dial after 5 people; theirs only with permission, 10 people, and a plan once plans are live', async () => {
  await makeUser(120, { gender: 'woman', interested_in: '{man}' });
  const mine = await quickReady(120);
  const raters = [];
  for (let k = 121; k <= 131; k++) { await makeUser(k, { gender: 'man', interested_in: '{woman}' }); raters.push(k); }
  for (const k of raters.slice(0, 4)) await dialAll(k, mine, [...Array(5).fill(60), 70, ...Array(5).fill(80)]);
  assert.deepEqual(await (async () => (await asUser(120, 'select my_quick_dial() d')).rows[0].d)(), { raters: 4, needed: 5 });
  await dialAll(raters[4], mine, [...Array(5).fill(60), 70, ...Array(5).fill(80)]);
  const d = (await asUser(120, 'select my_quick_dial() d')).rows[0].d;
  assert.equal(d.raters, 5); assert.equal(Number(d.score), 70); assert.equal(Number(d.looks), 60); assert.equal(Number(d.personality), 80);
  assert.equal(d.weeks.length, 1);
  assert.ok(mine.slice(6).includes(d.best_item));   // a story did best
  // Someone else's Dial
  const viewer = raters[10];
  assert.equal((await asUser(viewer, 'select quick_their_dial($1) d', [uuid(120)])).rows[0].d.reason, 'too_new');
  for (const k of raters.slice(5, 10)) await dialAll(k, mine, Array(11).fill(70));
  const t = (await asUser(viewer, 'select quick_their_dial($1) d', [uuid(120)])).rows[0].d;
  assert.equal(t.available, true); assert.equal(t.raters, 10);
  await asUser(120, 'select set_quick_show_dial(false)');
  assert.equal((await asUser(viewer, 'select quick_their_dial($1) d', [uuid(120)])).rows[0].d.reason, 'private');
  await asUser(120, 'select set_quick_show_dial(true)');
  await admin(`update economy set value=1 where key='quick_plans_live'`);
  assert.equal((await asUser(viewer, 'select quick_their_dial($1) d', [uuid(120)])).rows[0].d.reason, 'upgrade');
  await admin(`insert into subscriptions (member, tier, renews_at, source) values ($1,'plus', now() + interval '30 days', 'comp')`, [uuid(viewer)]);
  assert.equal((await asUser(viewer, 'select quick_their_dial($1) d', [uuid(120)])).rows[0].d.available, true);
  assert.deepEqual((await asUser(viewer, 'select allowance, tier from quick_today()')).rows[0], { allowance: 10, tier: 'plus' });
  await admin(`update economy set value=0 where key='quick_plans_live'`);
});

await test('deleting an account removes everything of theirs and keeps only a staff-only record of reports about them', async () => {
  const gone = 190, other = 191, staffer = 192;
  for (const n of [gone, other, staffer]) await makeUser(n);
  const item = await addMedia(gone);
  await asUser(other, 'select rate_media($1, 75)', [item]);
  await asUser(other, `select report_member($1, 'harassment', 'kept messaging after I said no')`, [uuid(gone)]);
  await asUser(gone, 'select report_member($1, $2)', [uuid(other), 'spam_or_scam']);
  await admin('insert into staff values ($1)', [uuid(staffer)]);
  await admin(`insert into mod_actions (staff, action, target) values ($1, 'note', $2)`, [uuid(staffer), uuid(other)]);
  await db.exec(`select set_config('request.jwt.claim.sub', '', false)`);
  await rejects(db.query('select prepare_account_deletion()'), /not_signed_in/);
  await asUser(gone, 'select prepare_account_deletion()');
  await admin('delete from auth.users where id = $1', [uuid(gone)]);
  for (const [table, col] of [['profiles', 'id'], ['media', 'owner'], ['reports', 'reporter'], ['blocks', 'blocker']])
    assert.equal((await admin(`select count(*)::int n from ${table} where ${col} = $1`, [uuid(gone)])).rows[0].n, 0, table);
  const kept = (await admin('select reports from account_deletions where member = $1', [uuid(gone)])).rows;
  assert.equal(kept.length, 1); assert.equal(kept[0].reports[0].reason, 'harassment');
  assert.equal((await asUser(other, 'select count(*)::int n from account_deletions')).rows[0].n, 0);   // staff only
  assert.equal((await asUser(staffer, 'select count(*)::int n from account_deletions')).rows[0].n, 1);
  // A member with nothing reported about them leaves no record at all.
  await asUser(other, 'select prepare_account_deletion()');
  assert.equal((await admin('select count(*)::int n from account_deletions where member = $1', [uuid(other)])).rows[0].n, 0);
  // Staff can leave too; their moderation history stays, unattributed.
  await admin('delete from auth.users where id = $1', [uuid(staffer)]);
  assert.equal((await admin(`select count(*)::int n from mod_actions where target = $1 and staff is null`, [uuid(other)])).rows[0].n, 1);
});

console.log(`\n${passed} checks passed${process.exitCode ? ', some FAILED' : ''}`);
