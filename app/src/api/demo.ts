// In-memory data source so the app can be explored without a backend.
// It applies the same rules as the database functions, using the shared core module.
// Every person here is invented, and the other side of each conversation is simulated.
import { ECONOMY, chapterFor, conversationLevel, type ConversationStats } from '../core/economy';
import { type IdealType, type LearnedRow, type Look } from '../core/looks';
import { GAMES } from '../core/games';
import { demoSuggestions } from '../core/demoSuggest';
import { MATCH_THRESHOLD } from './types';
import type {
  About, BlockedRow, ModMedia, ModReport, ReportReason, Api, Game, BoardRow, Challenge, DateFeedback, DatePlan, IncomingLike, LedgerEntry, Match, Me, Media, MediaStat, Message, Person, PickedFile,
} from './types';

const palettes: [string, string][] = [
  ['#3B1E54', '#C2409B'], ['#1B2A4A', '#5B3FD6'], ['#4A1D2F', '#FF6B5E'], ['#12333A', '#2E8B8B'],
  ['#2A1B3D', '#8C5BD6'], ['#3D1A2A', '#E07A5F'], ['#1A2238', '#6C7AB8'], ['#33213F', '#D98BB5'],
];
let seq = 0;
const id = (p: string) => `${p}-${++seq}`;
const photo = (caption: string, i: number): Media => ({ id: id('m'), kind: 'photo', caption, palette: palettes[i % palettes.length], myScore: null, moderation: 'approved' });
const video = (role: 'intro' | 'personality' | 'lifestyle', caption: string, i: number): Media =>
  ({ id: id('m'), kind: 'video', videoRole: role, caption, palette: palettes[i % palettes.length], myScore: null, moderation: 'approved' });

const people: Person[] = [
  { id: 'p1', firstName: 'Imogen', age: 31, city: 'Leeds', occupation: 'Landscape architect', intentions: 'something serious',
    bio: 'I will make you look at a tree for longer than you expected.', interests: ['Wild swimming', 'Film', 'Ceramics', 'Hiking'],
    traits: { humour: 0.8, openness: 0.7, talkative: 0.35, planner: 0.3, socialEnergy: 0.6, activity: 0.8, replyPace: 0.5 },
    look: { hairColour: 'auburn', hairLength: 'long', eyeColour: 'green', build: 'athletic', heightCm: 170 }, fitsTheirIdeal: 0.86,
    distanceBand: 'Under 5 km', chapter: 3,
    media: [photo('Ilkley Moor, before the rain', 0), video('intro', 'Introduction: a good Sunday', 1), photo('The kiln survived', 2), video('lifestyle', 'Lifestyle: cold water, warm flask', 4)] },
  { id: 'p2', firstName: 'Tobias', age: 34, city: 'Leeds', occupation: 'Secondary school music teacher', intentions: 'something serious',
    bio: 'Looking for someone to argue with about the best Sondheim.', interests: ['Jazz', 'Cooking', 'Film', 'Cycling'],
    traits: { humour: 0.9, openness: 0.6, talkative: 0.8, planner: 0.7, socialEnergy: 0.7, activity: 0.5, replyPace: 0.6 },
    look: { hairColour: 'brunette', hairLength: 'short', eyeColour: 'brown', build: 'average', heightCm: 183 }, fitsTheirIdeal: 0.62,
    distanceBand: 'Under 2 km', chapter: 4,
    media: [photo('School concert, post-encore', 3), video('personality', 'Personality: one-man band', 5), photo('Paella for eleven', 6)] },
  { id: 'p9', firstName: 'Marcus', age: 33, city: 'Leeds', occupation: 'Structural engineer', intentions: 'seeing where it goes',
    bio: 'Will explain why that bridge is standing. Only if asked.', interests: ['Climbing', 'Chess', 'Opera'],
    traits: { humour: 0.5, openness: 0.8, talkative: 0.4, planner: 0.9, socialEnergy: 0.4, activity: 0.8, replyPace: 0.4 },
    look: { hairColour: 'black', hairLength: 'short', eyeColour: 'blue', build: 'athletic', heightCm: 188 }, fitsTheirIdeal: 0.71,
    distanceBand: 'Under 15 km', chapter: 2,
    media: [photo('Almscliffe Crag, mid-fall', 4), photo('Board 3, losing', 7)] },
  { id: 'p3', firstName: 'Anouk', age: 29, city: 'York', occupation: 'Data journalist', intentions: 'seeing where it goes',
    bio: 'I collect bad charts and good bakeries.', interests: ['Running', 'Baking', 'Board games', 'Hiking'],
    traits: { humour: 0.7, openness: 0.8, talkative: 0.5, planner: 0.85, socialEnergy: 0.4, activity: 0.9, replyPace: 0.4 },
    look: { hairColour: 'blonde', hairLength: 'medium', eyeColour: 'blue', build: 'slim', heightCm: 162 }, fitsTheirIdeal: 0.9,
    distanceBand: 'Within 40 km', chapter: 2,
    media: [photo('Parkrun, allegedly smiling', 7), photo('Sourdough number 41', 1), video('intro', 'Introduction: charts I hate', 2)] },
  { id: 'p4', firstName: 'Rafferty', age: 36, city: 'Leeds', occupation: 'Furniture maker', intentions: 'something serious',
    bio: 'Slow mornings, sharp chisels.', interests: ['Woodwork', 'Hiking', 'Vinyl', 'Cooking'],
    traits: { humour: 0.6, openness: 0.5, talkative: 0.25, planner: 0.4, socialEnergy: 0.3, activity: 0.6, replyPace: 0.3 },
    look: { hairColour: 'red', hairLength: 'medium', eyeColour: 'green', build: 'average', heightCm: 178 }, fitsTheirIdeal: 0.55,
    distanceBand: 'Under 15 km', chapter: 5,
    media: [photo('The workshop at seven', 4), photo('Oak, mostly', 0), video('lifestyle', 'Lifestyle: Sunday market', 6)] },
];

const meMedia: Media[] = [photo('Me, mid-laugh', 5), video('intro', 'My introduction', 3), photo('Summit selfie', 7)];
const assessmentsDone = new Set<string>();
let myLook: Look = { hairColour: 'brunette', hairLength: 'short', eyeColour: 'brown', build: 'athletic', heightCm: 180 };
let idealTraits: Record<string, number> = {};
let idealTypes: IdealType[] = [];

const profileDials = new Map<string, number>();   // person → your Dial for them, 1..100
const meBase: Pick<Person, 'id' | 'firstName' | 'age' | 'city' | 'occupation' | 'intentions' | 'bio' | 'interests' | 'traits'> = {
  id: 'me', firstName: 'You', age: 32, city: 'Leeds', occupation: 'Product designer', intentions: 'something serious',
  bio: null, interests: ['Hiking', 'Film', 'Cooking', 'Wild swimming'],
  traits: { humour: 0.8, openness: 0.7, talkative: 0.75, planner: 0.8, socialEnergy: 0.6, activity: 0.7, replyPace: 0.5 } as Record<string, number>,
};

type DemoMatch = { id: string; personId: string; status: Match['status']; level: number; stats: ConversationStats;
                   messages: Message[]; iWantToMeet: boolean; voicePaid: boolean; openerPaid: boolean; iOpened: boolean };
type DemoPlan = DatePlan & { matchId: string; theirFeedback: DateFeedback | null; myFeedback: DateFeedback | null; paid: boolean };

const now = () => new Date().toISOString();
const msg = (mine: boolean, body: string, kind: 'text' | 'voice' = 'text'): Message => ({ id: id('x'), mine, kind, body, at: now() });

const extras: Person[] = [
  { id: 'p5', firstName: 'Saoirse', age: 30, interests: [], traits: {}, media: [photo('Harbour, 6am', 2)] },
  { id: 'p6', firstName: 'Kit', age: 33, interests: [], traits: {}, media: [photo('Allotment haul', 6)] },
  { id: 'p7', firstName: 'Elodie', age: 30, interests: [], traits: {}, media: [photo('Bookshop, aisle 4', 1)] },
  { id: 'p8', firstName: 'Jonah', age: 35, interests: [], traits: {}, media: [photo('Lake District, day 3', 3)] },
];

const matches: DemoMatch[] = [
  { id: 'c1', personId: 'p5', status: 'open', level: 1, iWantToMeet: false, voicePaid: false, openerPaid: true, iOpened: true,
    // A = me, B = them. One more message each takes this to Level 2.
    stats: { messagesA: 9, messagesB: 9, questionsA: 3, questionsB: 2, voiceA: 0, voiceB: 0, activeDays: 2, meetIntents: 0 },
    messages: [msg(false, 'The harbour photo was taken at 6am. I am not usually that person.'), msg(true, 'What got you up?'), msg(false, 'A seal. Long story. Do you swim in winter too?')] },
  { id: 'c2', personId: 'p6', status: 'open', level: 4, iWantToMeet: false, voicePaid: true, openerPaid: true, iOpened: false,
    stats: { messagesA: 22, messagesB: 25, questionsA: 6, questionsB: 7, voiceA: 1, voiceB: 2, activeDays: 4, meetIntents: 1 },
    messages: [msg(false, 'Courgettes are out of control. Send recipes.'), msg(true, 'Fritters. Always fritters.'), msg(false, 'Voice note (0:21)', 'voice'),
               msg(true, 'Voice note (0:15)', 'voice'), msg(false, 'Right, I owe you fritters. Friday?')] },
];

const incoming: Omit<IncomingLike, 'photo'>[] = [
  { likeId: 'l1', person: { id: 'p7', firstName: 'Elodie', age: 30 }, likedMedia: null, comment: 'Which summit? I need to know if I should be impressed.' },
  { likeId: 'l2', person: { id: 'p8', firstName: 'Jonah', age: 35 }, likedMedia: null, comment: null },
];

const plans: DemoPlan[] = [];
const games: (Game & { matchId: string })[] = [];
const demoConsents: Record<string, boolean> = { ai_coach: true, ai_coach_content: false };

const ledger: LedgerEntry[] = [
  { id: id('l'), amount: 100, reason: 'Profile completed', at: now() },
  { id: id('l'), amount: 50, reason: 'Introduction video', at: now() },
  { id: id('l'), amount: 50, reason: 'Photo and age verification', at: now() },
  { id: id('l'), amount: 20, reason: 'Openers that got a reply', at: now() },
  { id: id('l'), amount: 100, reason: 'Conversation with Kit reached Levels 2 to 4', at: now() },
  { id: id('l'), amount: 15, reason: 'Voice notes exchanged with Kit', at: now() },
];

// Safety: blocks, reports, and a moderation queue with a few invented cases to practise on.
const blocked = new Map<string, string>();     // person → when
const modReports: ModReport[] = [
  { id: 'r1', personId: 'x1', firstName: 'Dex', reason: 'spam_or_scam', detail: 'Asked me to move to another app to "invest" within three messages.', status: 'open', reportsAgainst: 3, reporters: 3, suspended: false, at: now() },
  { id: 'r2', personId: 'x2', firstName: 'Harvey', reason: 'harassment', detail: 'Kept messaging after I closed the chat, from a new account.', status: 'open', reportsAgainst: 1, reporters: 1, suspended: false, at: now() },
  { id: 'r3', personId: 'x3', firstName: 'Bella', reason: 'fake_profile', detail: 'Photos look like a model from an advert.', status: 'open', reportsAgainst: 1, reporters: 1, suspended: false, at: now() },
];
const otherPending: ModMedia[] = [
  { id: 'mm1', ownerId: 'x4', ownerName: 'Priya', at: now(), media: { id: 'mm1', kind: 'photo', caption: 'Festival, day two', palette: palettes[5], moderation: 'pending' } },
  { id: 'mm2', ownerId: 'x5', ownerName: 'Callum', at: now(), media: { id: 'mm2', kind: 'video', videoRole: 'intro', caption: 'Introduction', palette: palettes[2], moderation: 'pending' } },
];
const SEVERE = ['underage', 'felt_unsafe', 'harassment'];
const sortReports = () => modReports.sort((a, b) => Number(SEVERE.includes(b.reason)) - Number(SEVERE.includes(a.reason)));
sortReports();

const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());
let weeklyConversationInk = 135;
let weekInk = 135;
const award = (amount: number, reason: string, conversation = false) => {
  if (conversation) {
    amount = Math.min(amount, Math.max(0, ECONOMY.conversationWeeklyCap - weeklyConversationInk));
    weeklyConversationInk += amount;
  }
  if (amount > 0) { ledger.unshift({ id: id('l'), amount, reason, at: now() }); weekInk += amount; }
  return amount;
};
const inkTotal = () => ledger.reduce((s, l) => s + l.amount, 0);
const find = (pid: string) => [...people, ...extras].find((p) => p.id === pid)!;
const seen = new Set<string>();
const replies = ['Ha, fair. What are you up to this weekend?', 'That is a strong opinion and I respect it.', 'Go on, tell me more?', 'Agreed. Also, have you eaten at the new place on Call Lane?'];

// What happened today, for the challenges. The server checks the same things from its tables.
const today = { voice: false, question: false, specificLike: false, differentInterests: false, levelUpThisWeek: true };
const claimed = { day: false, week: false };
let boardOptIn = false;

function relevel(m: DemoMatch) {
  const next = conversationLevel(m.stats, m.level);
  const name = find(m.personId).firstName;
  for (let l = m.level + 1; l <= next; l++) if (l >= 2) { award(ECONOMY.level[l], `Conversation with ${name} reached Level ${l}`, true); today.levelUpThisWeek = true; }
  m.level = next;
  if (!m.voicePaid && m.stats.voiceA > 0 && m.stats.voiceB > 0) { m.voicePaid = true; award(ECONOMY.voiceExchange, `Voice notes exchanged with ${name}`, true); }
}

function newMatch(personId: string): DemoMatch {
  const open = matches.filter((m) => m.status === 'open').length;
  const m: DemoMatch = { id: id('c'), personId, status: open < ECONOMY.openConversationSlots ? 'open' : 'queued', level: 0, iWantToMeet: false,
    voicePaid: false, openerPaid: false, iOpened: false, messages: [],
    stats: { messagesA: 0, messagesB: 0, questionsA: 0, questionsB: 0, voiceA: 0, voiceB: 0, activeDays: 1, meetIntents: 0 } };
  matches.unshift(m);
  return m;
}

const later = (fn: () => void, ms = 900) => setTimeout(() => { fn(); changed(); }, ms);

function payDate(p: DemoPlan) {
  // Full award for the first date with this person, half for the second, nothing after.
  const earlier = plans.filter((x) => x.matchId === p.matchId && x.paid && x.id !== p.id).length;
  const factor = earlier === 0 ? 1 : earlier === 1 ? 0.5 : 0;
  const name = find(matches.find((m) => m.id === p.matchId)!.personId).firstName;
  p.paid = true; p.status = 'confirmed';
  award(Math.round(ECONOMY.dateConfirmed * factor), `Date with ${name} confirmed by you both`);
  return factor;
}

export const demoApi: Api = {
  mode: 'demo',
  async getMe(): Promise<Me> {
    return { ...meBase, look: myLook, idealTraits, idealTypes: [...idealTypes], media: meMedia, chapter: chapterFor(inkTotal()).number, ink: inkTotal(), inkThisWeek: weekInk, assessmentsDone: [...assessmentsDone] };
  },
  async getIntroductions() { return people.filter((p) => !seen.has(p.id) && !blocked.has(p.id)); },
  async rateMedia(mediaId, score) {
    if (score < 0 || score > 100) throw new Error('score_out_of_range');
    if (meMedia.some((m) => m.id === mediaId)) throw new Error('cannot_rate_own_media');
    for (const p of people) for (const m of p.media) if (m.id === mediaId) m.myScore = Math.round(score);
    changed();
  },
  async dialProfile(personId, score, note) {
    if (score < 1 || score > 100) throw new Error('score_out_of_range');
    profileDials.set(personId, Math.round(score)); seen.add(personId);
    const inc = incoming.findIndex((l) => l.person.id === personId);
    const theyDialledUp = inc >= 0;
    if (inc >= 0) incoming.splice(inc, 1);
    if (score < MATCH_THRESHOLD) { changed(); return { matchId: null }; }
    const them = find(personId);
    if (note?.trim()) today.specificLike = true;
    if (!them.interests.some((i) => meBase.interests.includes(i))) today.differentInterests = true;
    // In the demo, everyone you dial up dials you up too, except Rafferty, so both outcomes can be seen.
    if (personId === 'p4' && !theyDialledUp) { changed(); return { matchId: null }; }
    const m = newMatch(personId);
    if (note?.trim()) { m.messages.push(msg(true, note.trim())); m.stats.messagesA++; m.iOpened = true; }
    changed();
    return { matchId: m.id };
  },
  async getIncomingLikes() { return incoming.filter((l) => !blocked.has(l.person.id)).map((l) => ({ ...l, photo: find(l.person.id).media[0] ?? null })); },
  async getMatches() {
    return matches.map((m) => { const p = find(m.personId); return { id: m.id, person: { id: p.id, firstName: p.firstName, media: p.media }, status: m.status, level: m.level,
      lastMessage: m.messages[m.messages.length - 1]?.body ?? null, iWantToMeet: m.iWantToMeet }; });
  },
  async getMessages(matchId) { return [...(matches.find((m) => m.id === matchId)?.messages ?? [])]; },
  async sendMessage(matchId, body, kind = 'text') {
    const m = matches.find((x) => x.id === matchId);
    if (!m || m.status !== 'open') throw new Error('conversation_not_open');
    if (kind === 'text' && !body?.trim()) throw new Error('empty_message');
    if (m.messages.length === 0) m.iOpened = true;
    m.messages.push(msg(true, kind === 'voice' ? 'Voice note (0:12)' : body ?? '', kind));
    m.stats.messagesA++;
    if (kind === 'voice') { m.stats.voiceA++; today.voice = true; }
    if (body?.includes('?')) { m.stats.questionsA++; today.question = true; }
    relevel(m); changed();
    later(() => {
      if (m.status !== 'open') return;
      const voice = kind === 'voice';
      m.messages.push(msg(false, voice ? 'Voice note (0:18)' : replies[m.stats.messagesB % replies.length], voice ? 'voice' : 'text'));
      m.stats.messagesB++; if (voice) m.stats.voiceB++; else m.stats.questionsB++;
      if (m.iOpened && !m.openerPaid) { m.openerPaid = true; award(ECONOMY.openerReplied, `${find(m.personId).firstName} replied to your opener`, true); }
      relevel(m);
    });
  },
  async readyToMeet(matchId) {
    const m = matches.find((x) => x.id === matchId)!;
    if (!m.iWantToMeet) { m.iWantToMeet = true; m.stats.meetIntents++; }
    relevel(m); changed();
    return m.stats.meetIntents >= 2;
  },
  async closeMatch(matchId, note) {
    const m = matches.find((x) => x.id === matchId)!;
    m.status = 'closed'; m.messages.push(msg(true, note));
    const queued = matches.find((x) => x.status === 'queued'); if (queued) queued.status = 'open';
    changed();
  },
  async reportMember(personId, reason: ReportReason, detail, block = true) {
    const p = find(personId);
    const existing = modReports.find((r) => r.personId === personId);
    if (existing) existing.detail = [existing.detail, detail ?? reason].filter(Boolean).join('\n');
    else modReports.push({ id: id('r'), personId, firstName: p?.firstName ?? 'Someone', reason, detail: detail?.trim() || null, status: 'open', reportsAgainst: 1, reporters: 1, suspended: false, at: now() });
    sortReports();
    if (block) await demoApi.blockMember(personId); else changed();
  },
  async blockMember(personId) {
    blocked.set(personId, now()); seen.add(personId);
    for (const m of matches) if (m.personId === personId && (m.status === 'open' || m.status === 'queued')) m.status = 'closed';
    const i = incoming.findIndex((l) => l.person.id === personId); if (i >= 0) incoming.splice(i, 1);
    changed();
  },
  async unblockMember(personId) { blocked.delete(personId); seen.delete(personId); changed(); },
  async getBlocked(): Promise<BlockedRow[]> { return [...blocked].map(([personId, at]) => ({ personId, firstName: find(personId)?.firstName ?? 'Someone', at })); },
  async saveAbout(a: About) {
    if (a.interests.length > 8) throw new Error('Pick up to eight interests');
    meBase.bio = a.bio.trim() || null; meBase.occupation = a.occupation.trim() || null; meBase.city = a.city.trim() || null;
    meBase.intentions = a.intentions || null; meBase.interests = [...new Set(a.interests.map((i) => i.trim()).filter(Boolean))];
    changed();
  },
  async isStaff() { return true; },   // the demo lets you try the moderation console
  async getModReports() { return modReports.map((r) => ({ ...r })); },
  async getModMedia(): Promise<ModMedia[]> {
    const mine = meMedia.filter((m) => m.moderation === 'pending').map((m) => ({ id: m.id, ownerId: 'me', ownerName: `${meBase.firstName} (your upload)`, at: now(), media: m }));
    return [...mine, ...otherPending];
  },
  async resolveReport(reportId, outcome, suspendDays = 0) {
    const r = modReports.find((x) => x.id === reportId); if (!r) throw new Error('report_not_found');
    if (outcome === 'reviewing') r.status = 'reviewing';
    else {
      for (let i = modReports.length - 1; i >= 0; i--) {
        const x = modReports[i];
        if (x.id === reportId || (outcome === 'upheld' && suspendDays > 0 && x.personId === r.personId)) modReports.splice(i, 1);
      }
    }
    changed();
  },
  async reviewMedia(mediaId, approve) {
    const mine = meMedia.find((m) => m.id === mediaId && m.moderation === 'pending');
    if (mine) mine.moderation = approve ? 'approved' : 'rejected';
    else { const i = otherPending.findIndex((x) => x.id === mediaId); if (i < 0) throw new Error('media_not_pending'); otherPending.splice(i, 1); }
    changed();
  },
  async getSuggestions(matchId, tone) {
    if (!demoConsents.ai_coach) throw new Error('AI reply ideas are switched off in Profile');
    const m = matches.find((x) => x.id === matchId)!;
    const them = find(m.personId);
    const lastTheirs = [...m.messages].reverse().find((x) => !x.mine)?.body ?? null;
    await new Promise((r) => setTimeout(r, 450));                 // feels like a thought, not a lookup
    return { suggestions: demoSuggestions(tone, { theirName: them.firstName, shared: them.interests.filter((i) => meBase.interests.includes(i)), lastTheirs, level: m.level }),
             usedTheirMessages: false };
  },
  async getGames(matchId) { return games.filter((g) => g.matchId === matchId).map(({ matchId: _m, ...g }) => ({ ...g, theirPicks: Object.fromEntries(Object.entries(g.theirPicks).filter(([k]) => g.myPicks[Number(k)] != null)) })); },
  async startGame(matchId, kind) {
    games.forEach((g) => { if (g.matchId === matchId && g.status === 'active') g.status = 'complete'; });
    const g = { id: id('g'), matchId, kind, rounds: GAMES[kind].rounds, status: 'active' as const, startedByMe: true, myPicks: {}, theirPicks: {} };
    games.unshift(g); changed();
    // The simulated other person plays every round straight away, agreeing about half the time.
    later(() => { g.rounds.forEach((r, i) => { (g.theirPicks as any)[i] = (i * 7 + 3) % r.options.length; }); }, 700);
  },
  async playGame(gameId, round, option) {
    const g = games.find((x) => x.id === gameId)!;
    if (g.status !== 'active') throw new Error('game_over');
    if (g.myPicks[round] != null) return;
    if (round > 0 && g.myPicks[round - 1] == null) throw new Error('invalid_round');
    if (Math.random() < 0.5 && g.theirPicks[round] != null) (g.theirPicks as any)[round] = option;   // sometimes you agree
    (g.myPicks as any)[round] = option;
    if (Object.keys(g.myPicks).length === g.rounds.length) {
      g.status = 'complete';
      const m = matches.find((x) => x.id === g.matchId)!;
      m.stats.gamesCompleted = (m.stats.gamesCompleted ?? 0) + 1; relevel(m);
    }
    changed();
  },
  async getDatePlans(matchId) {
    return plans.filter((p) => p.matchId === matchId).map(({ matchId: _m, theirFeedback: _t, myFeedback, paid: _p, ...rest }) =>
      ({ ...rest, myFeedbackGiven: !!myFeedback }));
  },
  async proposeDate(matchId, venue, startsAt) {
    if (!venue.trim()) throw new Error('Add a place');
    if (startsAt.getTime() <= Date.now()) throw new Error('date_must_be_in_future');
    const p: DemoPlan = { id: id('d'), matchId, venue: venue.trim(), startsAt: startsAt.toISOString(), status: 'proposed', proposedByMe: true,
      myConfirmation: null, myFeedbackGiven: false, theirFeedback: null, myFeedback: null, paid: false };
    plans.unshift(p); changed();
    later(() => { if (p.status === 'proposed') p.status = 'accepted'; }, 1200);
  },
  async respondToDate(planId, accept) {
    const p = plans.find((x) => x.id === planId)!;
    if (p.proposedByMe) throw new Error('cannot_respond_to_own_plan');
    p.status = accept ? 'accepted' : 'declined'; changed();
  },
  async confirmDate(planId, happened) {
    const p = plans.find((x) => x.id === planId)!;
    if (new Date(p.startsAt).getTime() > Date.now()) throw new Error('date_has_not_happened_yet');
    if (p.myConfirmation !== null) return;
    p.myConfirmation = happened; changed();
    // The simulated other person confirms too. A "no" from either side pays nothing.
    later(() => { if (happened && !p.paid) payDate(p); });
  },
  async submitDateFeedback(planId, f) {
    const p = plans.find((x) => x.id === planId)!;
    if (p.status !== 'confirmed') throw new Error('date_not_confirmed');
    if (p.myFeedback) return;
    p.myFeedback = f; changed();
    later(() => {
      p.theirFeedback = { enjoyed: 5, conversation: 4, comfortable: 5, matchedProfile: 5, seeAgain: 5, feltUnsafe: false };
      if (f.enjoyed >= 4 && p.theirFeedback.enjoyed >= 4) {
        const earlier = plans.filter((x) => x.matchId === p.matchId && x.paid && x.id !== p.id).length;
        const factor = earlier === 0 ? 1 : earlier === 1 ? 0.5 : 0;
        award(Math.round(ECONOMY.dateMutualPositive * factor), 'You both enjoyed the date');
      }
    });
  },
  async demoSkipToAfter(planId) {
    const p = plans.find((x) => x.id === planId)!;
    p.startsAt = new Date(Date.now() - 3 * 3600e3).toISOString(); changed();
  },
  async submitAssessment(kind, traits) {
    for (const [k, v] of Object.entries(traits)) if (typeof v !== 'number' || v < 0 || v > 1) throw new Error('invalid_traits: ' + k);
    Object.assign(meBase.traits, traits);
    const first = !assessmentsDone.has(kind);
    assessmentsDone.add(kind);
    const amount = first ? award(kind === 'personality' ? 100 : 50, kind === 'personality' ? 'Personality assessment' : `${kind} game`) : 0;
    changed();
    return amount;
  },
  async getChallenges(): Promise<Challenge[]> {
    return [
      { code: 'voice_note', period: 'day', done: today.voice, claimed: claimed.day, ink: 15 },
      { code: 'ask_question', period: 'day', done: today.question, claimed: claimed.day, ink: 15 },
      { code: 'specific_like', period: 'day', done: today.specificLike, claimed: claimed.day, ink: 15 },
      { code: 'different_interests', period: 'day', done: today.differentInterests, claimed: claimed.day, ink: 15 },
      { code: 'move_forward', period: 'week', done: today.levelUpThisWeek, claimed: claimed.week, ink: 50 },
    ];
  },
  async claimChallenge(code) {
    const list = await this.getChallenges();
    const c = list.find((x) => x.code === code);
    if (!c) throw new Error('unknown_challenge');
    if (!c.done) throw new Error('challenge_not_done');
    if (claimed[c.period]) return 0;
    claimed[c.period] = true;
    const n = award(c.ink, c.period === 'day' ? 'Daily challenge' : 'Weekly challenge');
    changed();
    return n;
  },
  async getBoard(local): Promise<BoardRow[]> {
    if (!boardOptIn) return [];
    const others: [string, number, number][] = local
      ? [['Priya', 4, 640], ['Tom', 3, 515], ['Hannah', 5, 470], ['Dev', 2, 380], ['Ruth', 3, 205]]
      : [['Amara', 6, 905], ['Priya', 4, 640], ['Callum', 5, 610], ['Tom', 3, 515], ['Hannah', 5, 470], ['Dev', 2, 380], ['Ruth', 3, 205]];
    const rows = [...others.map(([firstName, chapter, ink]) => ({ firstName, chapter, ink, isMe: false })),
                  { firstName: 'You', chapter: chapterFor(inkTotal()).number, ink: weekInk, isMe: true }]
      .sort((a, b) => b.ink - a.ink);
    return rows.map((r, i) => ({ ...r, rank: i + 1 }));
  },
  async getConsent(kind) { return kind === 'leaderboards' ? boardOptIn : demoConsents[kind] ?? false; },
  async setConsent(kind, granted) { if (kind === 'leaderboards') boardOptIn = granted; else demoConsents[kind] = granted; changed(); },
  async uploadMedia(file: PickedFile, videoRole) {
    const photos = meMedia.filter((m) => m.kind === 'photo').length;
    if (file.kind === 'photo' && photos >= 10) throw new Error('photo_limit_reached');
    if (file.kind === 'video') {
      if (!videoRole) throw new Error('video_role_required');
      const i = meMedia.findIndex((m) => m.videoRole === videoRole); if (i >= 0) meMedia.splice(i, 1);
    }
    meMedia.push({ id: id('m'), kind: file.kind, videoRole: videoRole ?? null, url: file.uri, myScore: null, moderation: 'pending',
      caption: file.kind === 'photo' ? 'New photo' : `My ${videoRole} video`, palette: palettes[seq % palettes.length] });
    changed();
    // Stays in review until approved in Profile › Moderation, as it would with a real moderator.
  },
  async deleteMedia(mediaId) { const i = meMedia.findIndex((m) => m.id === mediaId); if (i >= 0) meMedia.splice(i, 1); changed(); },
  async saveMyLook(look) { myLook = { ...look }; changed(); },
  async submitIdealPartner(traits) {
    idealTraits = { ...traits };
    const first = !assessmentsDone.has('ideal_partner'); assessmentsDone.add('ideal_partner');
    const n = first ? award(50, 'Ideal partner game') : 0; changed(); return n;
  },
  async saveIdealType(t) { idealTypes = [...idealTypes.filter((x) => x.rank !== t.rank), t].sort((a, b) => a.rank - b.rank); changed(); },
  async deleteIdealType(rank) { idealTypes = idealTypes.filter((x) => x.rank !== rank); changed(); },
  async getLearnedType(): Promise<LearnedRow[]> {
    const rows = new Map<string, LearnedRow>();
    for (const c of people) {
      if (!profileDials.has(c.id) || !c.look) continue;
      const score = profileDials.get(c.id)!;
      for (const [dimension, value] of [['hair', c.look.hairColour], ['length', c.look.hairLength], ['eyes', c.look.eyeColour], ['build', c.look.build]] as const) {
        if (!value) continue;
        const k = dimension + ':' + value;
        const r = rows.get(k) ?? { dimension, value, shown: 0, liked: 0, avgScore: 0 };
        r.avgScore = ((r.avgScore ?? 0) * r.shown + score) / (r.shown + 1);
        r.shown++; if (score >= MATCH_THRESHOLD) r.liked++; rows.set(k, r);
      }
    }
    return [...rows.values()].map((r) => ({ ...r, avgScore: Math.round((r.avgScore ?? 0) * 10) / 10 }));
  },
  async getLedger() { return [...ledger]; },
  async getMyMediaStats(): Promise<MediaStat[]> {
    return meMedia.map((m, i) => i === 0 ? { mediaId: m.id, raters: 14, average: 78.5 } : i === 1 ? { mediaId: m.id, raters: 9, average: 84 }
      : { mediaId: m.id, raters: i === 2 ? 3 : 0, average: null });
  },
  subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
