// Production data source. Every write goes through a database function, so Ink,
// levels and matches are decided on the server (see supabase/migrations).
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GAMES } from '../core/games';
import type { About, BlockedRow, ModMedia, ModReport, Api, BoardRow, Game, IdealType, LearnedRow, Challenge, DatePlan, IncomingLike, LedgerEntry, Match, Me, Media, MediaStat, Message, Person } from './types';

const MEDIA_BUCKET = 'media';
const SIGNED_URL_SECONDS = 60 * 60;

const reasonLabels: Record<string, string> = {
  conv_opener_replied: 'Your opener got a reply',
  conv_level_2: 'Conversation reached Level 2',
  conv_level_3: 'Conversation reached Level 3',
  conv_level_4: 'Conversation reached Level 4',
  conv_level_5: 'Conversation reached Level 5',
  conv_voice_exchange: 'Voice notes exchanged',
  date_confirmed: 'Date confirmed by both of you',
  date_mutual_positive: 'You both enjoyed the date',
  assessment_ideal_partner: 'Ideal partner game',
  assessment_personality: 'Personality assessment',
  assessment_logic: 'Logic game',
  assessment_creativity: 'Creativity game',
  assessment_humour: 'Humour game',
  challenge_day: 'Daily challenge',
  challenge_week: 'Weekly challenge',
};

export function createSupabaseApi(url: string, anonKey: string): Api & { client: SupabaseClient } {
  const client = createClient(url, anonKey, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  const uid = async () => (await client.auth.getUser()).data.user?.id ?? null;
  const ok = <T,>(r: { data: T; error: { message: string } | null }): T => { if (r.error) throw new Error(r.error.message); return r.data; };

  async function mediaFor(ownerIds: string[], me: string): Promise<Map<string, Media[]>> {
    const out = new Map<string, Media[]>();
    if (!ownerIds.length) return out;
    const rows = ok(await client.from('media').select('id, owner, kind, video_role, caption, storage_path, position, moderation')
      .in('owner', ownerIds).order('position')) ?? [];
    const mine = ok(await client.from('media_ratings').select('media_id, score').eq('rater', me)) ?? [];
    const scores = new Map(mine.map((r: any) => [r.media_id, r.score]));
    const signed = rows.length ? ok(await client.storage.from(MEDIA_BUCKET).createSignedUrls(rows.map((r: any) => r.storage_path), SIGNED_URL_SECONDS)) ?? [] : [];
    rows.forEach((r: any, i: number) => {
      const list = out.get(r.owner) ?? [];
      list.push({ id: r.id, kind: r.kind, videoRole: r.video_role, caption: r.caption, url: (signed[i] as any)?.signedUrl ?? null, myScore: scores.get(r.id) ?? null, moderation: r.moderation });
      out.set(r.owner, list);
    });
    return out;
  }
  const lookOf = (r: any) => ({ hairColour: r.hair_colour, hairLength: r.hair_length, eyeColour: r.eye_colour, build: r.build, heightCm: r.height_cm });
  const ageOf = (birth: string) => Math.floor((Date.now() - new Date(birth).getTime()) / (365.25 * 864e5));

  client.channel('dial-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, changed)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, changed)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'game_picks' }, changed)
    .subscribe();

  return {
    mode: 'supabase',
    client,
    async getMe(): Promise<Me | null> {
      const me = await uid(); if (!me) return null;
      const p: any = ok(await client.from('profiles').select('id, first_name, birth_date, city, occupation, bio, intentions, interests, traits, hair_colour, hair_length, eye_colour, build, height_cm').eq('id', me).maybeSingle()); if (!p) return null;
      const idealTraits = (ok(await client.rpc('my_ideal_traits')) as any) ?? {};
      const typeRows: any[] = ok(await client.from('ideal_types').select('*').order('rank')) ?? [];
      const idealTypes: IdealType[] = typeRows.map((t) => ({ rank: t.rank, hairColours: t.hair_colours, hairLengths: t.hair_lengths, eyeColours: t.eye_colours,
        builds: t.builds, heightMin: t.height_min, heightMax: t.height_max, vibes: t.vibes }));
      const prog: any = (ok(await client.rpc('my_progress')) ?? [])[0] ?? { ink: 0, chapter: 1, ink_this_week: 0 };
      const media = (await mediaFor([me], me)).get(me) ?? [];
      const done: any[] = ok(await client.from('assessments').select('kind')) ?? [];
      return { assessmentsDone: done.map((d) => d.kind), idealTraits, idealTypes, look: lookOf(p), id: me, firstName: p.first_name, age: ageOf(p.birth_date), city: p.city, occupation: p.occupation, bio: p.bio,
        intentions: p.intentions, interests: p.interests ?? [], traits: p.traits ?? {}, media, chapter: prog.chapter, ink: prog.ink, inkThisWeek: prog.ink_this_week };
    },
    async getIntroductions(): Promise<Person[]> {
      const me = await uid(); if (!me) return [];
      const rows: any[] = ok(await client.rpc('get_introductions', { p_limit: 12 })) ?? [];
      const media = await mediaFor(rows.map((r) => r.id), me);
      return rows.map((r) => ({ id: r.id, firstName: r.first_name, age: r.age, city: r.city, occupation: r.occupation, bio: r.bio,
        intentions: r.intentions, interests: r.interests ?? [], traits: r.traits ?? {}, distanceBand: r.distance_band, media: media.get(r.id) ?? [],
        look: lookOf(r), fitsTheirIdeal: r.fits_their_ideal == null ? null : Number(r.fits_their_ideal) }));
    },
    async rateMedia(mediaId, score) { ok(await client.rpc('rate_media', { p_media: mediaId, p_score: Math.round(score) })); changed(); },
    async dialProfile(personId, score, note) {
      const matchId = ok(await client.rpc('dial_profile', { p_subject: personId, p_score: Math.round(score), p_note: note ?? null })) as string | null;
      changed(); return { matchId };
    },
    async getMatches(): Promise<Match[]> {
      const me = await uid(); if (!me) return [];
      const rows: any[] = ok(await client.from('matches').select('*').in('status', ['open', 'queued']).order('created_at', { ascending: false })) ?? [];
      const others = rows.map((m) => (m.user_a === me ? m.user_b : m.user_a));
      const profiles: any[] = others.length ? ok(await client.from('profiles').select('id, first_name').in('id', others)) ?? [] : [];
      const media = await mediaFor(others, me);
      const intents: any[] = ok(await client.from('meet_intents').select('match_id')) ?? [];
      return rows.map((m, i) => ({ id: m.id, status: m.status, level: m.level, lastMessage: null,
        iWantToMeet: intents.some((x) => x.match_id === m.id),
        person: { id: others[i], firstName: profiles.find((p) => p.id === others[i])?.first_name ?? 'Someone', media: media.get(others[i]) ?? [] } }));
    },
    async getMessages(matchId): Promise<Message[]> {
      const me = await uid();
      const rows: any[] = ok(await client.from('messages').select('*').eq('match_id', matchId).order('created_at')) ?? [];
      return rows.map((r) => ({ id: String(r.id), mine: r.sender === me, kind: r.kind === 'voice' ? 'voice' : 'text', body: r.body, at: r.created_at }));
    },
    async sendMessage(matchId, body, kind = 'text') { ok(await client.rpc('send_message', { p_match: matchId, p_body: body, p_kind: kind })); changed(); },
    async readyToMeet(matchId) { const both = ok(await client.rpc('ready_to_meet', { p_match: matchId })) as boolean; changed(); return both; },
    async reportMember(personId, reason, detail, block = true) {
      ok(await client.rpc('report_member', { p_reported: personId, p_reason: reason, p_detail: detail ?? null, p_block: block })); changed();
    },
    async blockMember(personId) { ok(await client.rpc('block_member', { p_other: personId })); changed(); },
    async unblockMember(personId) { ok(await client.rpc('unblock_member', { p_other: personId })); changed(); },
    async getBlocked(): Promise<BlockedRow[]> {
      const rows: any[] = ok(await client.rpc('my_blocks')) ?? [];
      return rows.map((r) => ({ personId: r.member, firstName: r.first_name, at: r.blocked_at }));
    },
    async saveAbout(a: About) {
      ok(await client.rpc('save_about', { p_bio: a.bio, p_occupation: a.occupation, p_city: a.city, p_intentions: a.intentions, p_interests: a.interests })); changed();
    },
    async isStaff() { return !!ok(await client.rpc('am_i_staff')); },
    async getModReports(): Promise<ModReport[]> {
      const rows: any[] = ok(await client.rpc('mod_reports')) ?? [];
      return rows.map((r) => ({ id: r.report_id, personId: r.reported, firstName: r.reported_name, reason: r.reason, detail: r.detail, status: r.status,
        reportsAgainst: r.reports_against, reporters: r.reporters, suspended: r.suspended, at: r.created_at }));
    },
    async getModMedia(): Promise<ModMedia[]> {
      const rows: any[] = ok(await client.rpc('mod_media_queue')) ?? [];
      const signed = rows.length ? ok(await client.storage.from(MEDIA_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_SECONDS)) ?? [] : [];
      return rows.map((r, i) => ({ id: r.media_id, ownerId: r.owner, ownerName: r.owner_name, at: r.created_at,
        media: { id: r.media_id, kind: r.kind, videoRole: r.video_role, caption: r.caption, url: (signed[i] as any)?.signedUrl ?? null, moderation: 'pending' } }));
    },
    async resolveReport(reportId, outcome, suspendDays = 0) {
      ok(await client.rpc('mod_resolve_report', { p_report: reportId, p_outcome: outcome, p_suspend_days: suspendDays })); changed();
    },
    async reviewMedia(mediaId, approve) { ok(await client.rpc('mod_review_media', { p_media: mediaId, p_approve: approve })); changed(); },
    async closeMatch(matchId, note) { ok(await client.rpc('close_match', { p_match: matchId, p_note: note })); changed(); },
    async getIncomingLikes(): Promise<IncomingLike[]> {
      const me = await uid(); if (!me) return [];
      const rows: any[] = ok(await client.rpc('incoming_likes')) ?? [];
      const all = await mediaFor([me, ...rows.map((r) => r.from_id)], me);
      const mine = all.get(me) ?? [];
      return rows.map((r) => ({ likeId: r.like_id, person: { id: r.from_id, firstName: r.first_name, age: r.age },
        likedMedia: mine.find((m) => m.id === r.media_id) ?? null, comment: r.comment,
        photo: (all.get(r.from_id) ?? []).find((m) => m.kind === 'photo') ?? null }));
    },
    async getSuggestions(matchId, tone) {
      const { data, error } = await client.functions.invoke('suggest-replies', { body: { matchId, tone } });
      if (error) throw new Error((data as any)?.error ?? error.message);
      return { suggestions: (data as any).suggestions ?? [], usedTheirMessages: !!(data as any).usedTheirMessages };
    },
    async getGames(matchId): Promise<Game[]> {
      const rows: any[] = ok(await client.rpc('my_games', { p_match: matchId })) ?? [];
      const num = (o: Record<string, number>) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [Number(k), v]));
      return rows.map((r) => ({ id: r.id, kind: r.kind, rounds: r.rounds, status: r.status, startedByMe: r.started_by_me, myPicks: num(r.my_picks), theirPicks: num(r.their_picks) }));
    },
    async startGame(matchId, kind) { ok(await client.rpc('start_game', { p_match: matchId, p_kind: kind, p_rounds: GAMES[kind].rounds })); changed(); },
    async playGame(gameId, round, option) { ok(await client.rpc('play_game', { p_game: gameId, p_round: round, p_option: option })); changed(); },
    async getDatePlans(matchId): Promise<DatePlan[]> {
      const me = await uid();
      const rows: any[] = ok(await client.from('date_plans').select('*').eq('match_id', matchId).order('created_at', { ascending: false })) ?? [];
      const ids = rows.map((r) => r.id);
      const conf: any[] = ids.length ? ok(await client.from('date_confirmations').select('plan_id, happened').in('plan_id', ids)) ?? [] : [];
      const fb: any[] = ids.length ? ok(await client.from('date_feedback').select('plan_id').in('plan_id', ids)) ?? [] : [];
      return rows.map((r) => ({ id: r.id, venue: r.venue, startsAt: r.starts_at, status: r.status, proposedByMe: r.proposed_by === me,
        myConfirmation: conf.find((c) => c.plan_id === r.id)?.happened ?? null, myFeedbackGiven: fb.some((f) => f.plan_id === r.id) }));
    },
    async proposeDate(matchId, venue, startsAt) {
      ok(await client.rpc('propose_date', { p_match: matchId, p_venue: venue, p_starts_at: startsAt.toISOString() })); changed();
    },
    async respondToDate(planId, accept) { ok(await client.rpc('respond_to_date', { p_plan: planId, p_accept: accept })); changed(); },
    async confirmDate(planId, happened) { ok(await client.rpc('confirm_date', { p_plan: planId, p_happened: happened })); changed(); },
    async submitDateFeedback(planId, f) {
      ok(await client.rpc('submit_date_feedback', { p_plan: planId, p_enjoyed: f.enjoyed, p_conversation: f.conversation,
        p_comfortable: f.comfortable, p_matched_profile: f.matchedProfile, p_see_again: f.seeAgain, p_felt_unsafe: f.feltUnsafe }));
      changed();
    },
    async submitAssessment(kind, traits) {
      const n = ok(await client.rpc('submit_assessment', { p_kind: kind, p_traits: traits })) as number; changed(); return n;
    },
    async getChallenges(): Promise<Challenge[]> {
      return (ok(await client.rpc('my_challenges')) as any[] ?? []).map((c) => ({ code: c.code, period: c.period, done: c.done, claimed: c.claimed, ink: c.ink }));
    },
    async claimChallenge(code) { const n = ok(await client.rpc('claim_challenge', { p_code: code })) as number; changed(); return n; },
    async getBoard(local): Promise<BoardRow[]> {
      return (ok(await client.rpc('weekly_board', { p_local: local })) as any[] ?? [])
        .map((r) => ({ rank: r.rank, firstName: r.first_name, chapter: r.chapter, ink: r.ink, isMe: r.is_me }));
    },
    async getConsent(kind) {
      const r: any = ok(await client.from('consents').select('granted').eq('kind', kind).maybeSingle());
      return r ? !!r.granted : kind === 'ai_coach';   // reply ideas are on unless switched off; reading your messages is off unless switched on
    },
    async setConsent(kind, granted) {
      const me = await uid(); if (!me) return;
      ok(await client.from('consents').upsert({ member: me, kind, granted, updated_at: new Date().toISOString() })); changed();
    },
    async uploadMedia(file, videoRole) {
      const me = await uid(); if (!me) throw new Error('not_authenticated');
      const body = await (await fetch(file.uri)).arrayBuffer();
      const type = file.mimeType ?? (file.kind === 'photo' ? 'image/jpeg' : 'video/mp4');
      const ext = type.split('/')[1]?.replace('quicktime', 'mov') ?? 'bin';
      const path = `${me}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      ok(await client.storage.from(MEDIA_BUCKET).upload(path, body, { contentType: type }));
      if (file.kind === 'video' && videoRole) {
        // one video per role: replace the old one
        const old: any[] = ok(await client.from('media').select('id, storage_path').eq('owner', me).eq('video_role', videoRole)) ?? [];
        for (const o of old) { await client.from('media').delete().eq('id', o.id); await client.storage.from(MEDIA_BUCKET).remove([o.storage_path]); }
      }
      const r = await client.from('media').insert({ owner: me, kind: file.kind, video_role: file.kind === 'video' ? videoRole : null, storage_path: path, position: Date.now() % 1e9 });
      if (r.error) { await client.storage.from(MEDIA_BUCKET).remove([path]); throw new Error(r.error.message); }
      changed();
    },
    async deleteMedia(mediaId) {
      const r: any = ok(await client.from('media').select('storage_path').eq('id', mediaId).maybeSingle());
      ok(await client.from('media').delete().eq('id', mediaId));
      if (r?.storage_path) await client.storage.from(MEDIA_BUCKET).remove([r.storage_path]);
      changed();
    },
    async saveMyLook(look) {
      const me = await uid(); if (!me) return;
      ok(await client.from('profiles').update({ hair_colour: look.hairColour ?? null, hair_length: look.hairLength ?? null, eye_colour: look.eyeColour ?? null,
        build: look.build ?? null, height_cm: look.heightCm ?? null }).eq('id', me));
      changed();
    },
    async submitIdealPartner(traits) { const n = ok(await client.rpc('submit_ideal_partner', { p_traits: traits })) as number; changed(); return n; },
    async saveIdealType(t) {
      const me = await uid(); if (!me) return;
      ok(await client.from('ideal_types').upsert({ member: me, rank: t.rank, hair_colours: t.hairColours, hair_lengths: t.hairLengths, eye_colours: t.eyeColours,
        builds: t.builds, height_min: t.heightMin ?? null, height_max: t.heightMax ?? null, vibes: t.vibes, updated_at: new Date().toISOString() }));
      changed();
    },
    async deleteIdealType(rank) { ok(await client.from('ideal_types').delete().eq('rank', rank)); changed(); },
    async getLearnedType(): Promise<LearnedRow[]> {
      return ((ok(await client.rpc('my_learned_type')) as any[]) ?? []).map((r) => ({ dimension: r.dimension, value: r.value, shown: r.shown, liked: r.liked, avgScore: r.avg_score == null ? null : Number(r.avg_score) }));
    },
    async getLedger(): Promise<LedgerEntry[]> {
      const rows: any[] = ok(await client.from('ink_ledger').select('*').order('created_at', { ascending: false }).limit(50)) ?? [];
      return rows.map((r) => ({ id: String(r.id), amount: r.amount, reason: reasonLabels[r.reason] ?? r.reason, at: r.created_at }));
    },
    async getMyMediaStats(): Promise<MediaStat[]> {
      const rows: any[] = ok(await client.rpc('my_media_stats')) ?? [];
      return rows.map((r) => ({ mediaId: r.media_id, raters: r.raters, average: r.average_score == null ? null : Number(r.average_score) }));
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
