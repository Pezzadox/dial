// Quick Dial's data. The demo runs on invented people; with Supabase keys it uses the same backend
// as Dial (the quick_* functions in migration 0009).
import * as WebBrowser from 'expo-web-browser';
import { supabaseApi } from '../api';
import type { Look } from '../core/looks';
import { QD, STORY_PROMPTS, isHigh, weighted, type MyDial, type QBreakdown, type QCardRow, type QMedia, type QPerson, type Tier } from './core';

export type QChat = { otherId: string; firstName: string; age: number; look: Look; mutual: boolean; last: string | null; lastFromMe: boolean; at: string };
export type QMessage = { id: string; fromMe: boolean; body: string; at: string };
export type QNotice = { title: string; body: string; withId: string };
/** photos holds the whole Quick set you've added: 5 photos, the talking video, and stories (kind 'story'). */
export type QProfile = { firstName: string; birthDate: string; gender: string; showMe: string[]; photos: QMedia[]; booth?: QMedia[]; maxMiles?: number; place?: string | null };
export type QSettings = { showDial: boolean; verified: boolean; tier: Tier; plansLive: boolean };
export type TheirDial = { available: false; reason: 'private' | 'too_new' | 'upgrade' } | (QBreakdown & { available: true; raters: number });
export type QDrop = { at: string; waiting: number };
export type QToday = { used: number; allowance: number; resetsAt: string; tier: Tier; nextDrop: string };
/** A deck of ten, plus how many in it dialled you high but are hidden (free members, once plans are live). */
export type QDeck = QPerson[] & { hiddenAdmirers?: number };
export type DialResult = { complete: false; dialled: number } | (QBreakdown & { complete: true; mutual: boolean });

export interface QuickApi {
  readonly mode: 'demo' | 'supabase';
  getProfile(): Promise<QProfile | null>;
  saveProfile(p: QProfile): Promise<void>;
  /** Your five stories (prompt + answer), checked before anyone sees them. */
  saveStories(stories: { prompt: string; answer: string }[]): Promise<void>;
  /** Your three photobooth selfies (photo URIs from the camera). */
  saveBooth(uris: string[]): Promise<void>;
  /** Rounded to ~1 km before it's stored. Returns a place name to show back, if known. */
  setLocation(lat: number, lng: number): Promise<void>;
  setMaxMiles(miles: number): Promise<void>;
  getDeck(): Promise<QDeck>;
  /** People dialled today, today's allowance (3 free, plus extra rounds), and when it resets. */
  getToday(): Promise<QToday>;
  /** Paid add-on: one more round today. */
  buyExtraRound(): Promise<void>;
  dial(personId: string, mediaId: string, score: number): Promise<DialResult>;
  getCard(): Promise<QCardRow[]>;
  getChats(): Promise<QChat[]>;
  getMessages(otherId: string): Promise<QMessage[]>;
  send(otherId: string, body: string): Promise<void>;
  report(otherId: string, reason: string, detail?: string, block?: boolean): Promise<void>;
  block(otherId: string): Promise<void>;
  /** Your own Dial: averages over time, once enough people have dialled you. */
  getMyDial(): Promise<MyDial>;
  /** Someone else's Dial: only with their permission, from 10+ people, for Quick+ once plans are live. */
  getTheirDial(personId: string): Promise<TheirDial>;
  getSettings(): Promise<QSettings>;
  setShowDial(show: boolean): Promise<void>;
  /** Selfie + age check. Returns when done (demo) or after the provider's page (real app). */
  verify(): Promise<void>;
  /** Mutuals that happened while you were away arrive together at 8pm. */
  getDrop(): Promise<QDrop>;
  /** Demo only: open tonight's drop now. */
  openDropNow?(): Promise<void>;
  /** Demo only: try a plan before plans go live. */
  tryTier?(t: Tier): Promise<void>;
  subscribe(onChange: () => void): () => void;
  /** Push notifications: the real app gets them from the phone; the demo shows them as a banner. */
  onNotice(l: (n: QNotice) => void): () => void;
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
const uid = (() => { let n = 0; return (p: string) => `${p}${++n}`; })();
const now = () => new Date().toISOString();

const PALETTES: [string, string][] = [
  ['#FF6B5E', '#5B3FD6'], ['#C2409B', '#1B1530'], ['#EADBC2', '#C2409B'], ['#3F6FB5', '#C2409B'],
  ['#D9B26A', '#7A3B22'], ['#5B3FD6', '#0E0C1A'], ['#2E8C7A', '#5B3FD6'], ['#FF8A65', '#C2409B'],
];
const WOMEN = ['Imogen', 'Anouk', 'Saoirse', 'Elodie', 'Priya', 'Freya', 'Maya', 'Isla', 'Zara', 'Niamh', 'Leila', 'Ruby', 'Chloé', 'Amara', 'Hana', 'Tess', 'Bea', 'Mia', 'Lottie', 'Esme'];
const MEN = ['Tobias', 'Marcus', 'Rafferty', 'Kit', 'Jonah', 'Callum', 'Theo', 'Idris', 'Finn', 'Arlo', 'Rohan', 'Luca', 'Ezra', 'Oscar', 'Kwame', 'Felix', 'Hugo', 'Sami', 'Rory', 'Nico'];
const CITIES = ['Leeds', 'Manchester', 'York', 'Sheffield', 'Harrogate', 'Bradford'];
const CAPTIONS = ['Sunday market', 'Top of Pen-y-ghent', 'Lisbon, golden hour', 'Too many plants', 'Fancy dress, no regrets', 'First half marathon',
  'Grandma\'s recipe', 'Festival, day two', 'Sea swim, 7°C', 'Gig at the Brudenell', 'Pottery class disaster', 'Best dog in Yorkshire',
  'Brunch is a personality', 'Lake District weekend', 'Wedding guest era', 'Night out, early', 'Camping in Skye', 'Vinyl haul'];
const VIDEO_CAPTIONS = ['Say hello', 'My Sunday in 10 seconds', 'Me trying to surf', 'Kitchen dance break'];
const HAIR = ['black', 'brunette', 'auburn', 'red', 'blonde', 'grey'] as const;
const EYES = ['brown', 'hazel', 'green', 'blue', 'grey'] as const;
const BUILD = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const;

const ANSWERS: Record<string, string[]> = {
  'My most useless talent': ['I can tell you the day of the week for any date since 1990.', 'Whistling with a mouthful of crisps.', 'Naming any Beatles song in three notes.'],
  'The way to win me over': ['Bring snacks. Remember my order. Laugh at my bad puns.', 'Plan the date and let me pick the pudding.', 'Send me a song you think I\'ll like.'],
  'A perfect Sunday': ['Long run, longer brunch, a nap I didn\'t plan.', 'Car boot sale at 7am, roast at 2pm, asleep by 9.', 'Hills, a pub with a fire, a dog to steal.'],
  'I\'ll never shut up about': ['The time I met Jarvis Cocker in a chip shop.', 'Why Leeds has the best indie venues in the country.', 'Sourdough. I\'m sorry. I know.'],
  'My friends would say I\'m': ['The one who books the restaurant.', 'Chaotic, but always on time.', 'Too competitive at board games.'],
  'The best trip I\'ve taken': ['Interrailing to Ljubljana with a broken suitcase.', 'Three days in Skye, rain the whole time, loved it.', 'A last-minute ferry to Bilbao.'],
  'A green flag I look for': ['Says thank you to the bus driver.', 'Has a niche hobby they light up about.', 'Can laugh at themselves.'],
  'My go-to karaoke song': ['Dancing in the Moonlight, every single time.', 'Anything by ABBA, full choreography.', 'A power ballad I can\'t quite reach.'],
  'Something I\'m weirdly good at': ['Parallel parking first time.', 'Remembering everyone\'s birthday.', 'Finding the best chips in any town.'],
  'My hottest take': ['Pineapple on pizza is fine. Grow up.', 'Brunch is just lunch with a better PR team.', 'The Christmas film season starts in October.'],
  'The last thing that made me laugh out loud': ['My nan trying to send a voice note.', 'A pigeon walking into Greggs like a regular.', 'My own joke, if I\'m honest.'],
  'I\'m happiest when': ['There\'s sea in front of me and chips in my hand.', 'Everyone I love is round one table.', 'I\'ve finished a run I didn\'t want to start.'],
};
const storiesFor = () => {
  const prompts = [...STORY_PROMPTS].sort(() => rnd() - 0.5).slice(0, QD.stories);
  return prompts.map((prompt) => ({ id: uid('qs'), kind: 'story' as const, prompt, answer: pick(ANSWERS[prompt]), palette: pick(PALETTES) }));
};

type DemoPerson = QPerson & { gender: 'woman' | 'man'; likesYou: number; community: QBreakdown & { raters: number; show: boolean } };
function makePerson(name: string, gender: 'woman' | 'man'): DemoPerson {
  const media: QMedia[] = [];
  const used = new Set<string>();
  for (let i = 0; i < QD.photos; i++) {
    let c = pick(CAPTIONS); while (used.has(c)) c = pick(CAPTIONS); used.add(c);
    media.push({ id: uid('qm'), kind: 'photo', caption: c, palette: pick(PALETTES) });
  }
  media.push({ id: uid('qm'), kind: 'video', caption: pick(VIDEO_CAPTIONS), palette: pick(PALETTES) });
  media.push(...storiesFor());
  const looks = 50 + Math.floor(rnd() * 40), vibe = 50 + Math.floor(rnd() * 40), personality = 50 + Math.floor(rnd() * 40);
  const raters = Math.floor(rnd() * 60);
  return {
    id: uid('qp'), firstName: name, gender, age: 23 + Math.floor(rnd() * 14), city: pick(CITIES),
    look: { hairColour: pick(HAIR), hairLength: pick(['short', 'medium', 'long'] as const), eyeColour: pick(EYES), build: pick(BUILD), heightCm: gender === 'woman' ? 155 + Math.floor(rnd() * 22) : 168 + Math.floor(rnd() * 25) },
    media, likesYou: rnd(), verified: true,
    miles: 1 + Math.floor(rnd() * rnd() * 60),
    // Photobooth: three selfies, each a slightly different pose and backdrop.
    booth: [0, 1, 2].map((k) => ({ id: uid('qb'), kind: 'photo' as const, palette: pick(PALETTES), caption: ['tilt-left', 'straight', 'tilt-right'][k] })),
    community: { ...weighted([{ kind: 'photo', score: looks }, { kind: 'video', score: vibe }, { kind: 'story', score: personality }]), looks, vibe, personality, raters, show: rnd() > 0.15 },
  };
}
const everyone: DemoPerson[] = [...WOMEN.map((n) => makePerson(n, 'woman')), ...MEN.map((n) => makePerson(n, 'man'))];

let profile: QProfile | null = null;
const dials = new Map<string, Map<string, number>>();         // person → media → score
const scored = new Map<string, QCardRow>();
const chats = new Map<string, { person: DemoPerson; mutual: boolean; messages: QMessage[]; at: string }>();
const listeners = new Set<() => void>();
const noticeListeners = new Set<(n: QNotice) => void>();
const changed = () => listeners.forEach((l) => l());
const notify = (n: QNotice) => noticeListeners.forEach((l) => l(n));
const later = (fn: () => void, ms: number) => setTimeout(fn, ms);
const find = (id: string) => everyone.find((p) => p.id === id)!;
const blocked = new Set<string>();
let tier: Tier = 'free';
let maxMiles = 25;
let showDial = true;
let verified = false;
let extraToday = 0;
const perDay = () => (tier === 'gold' ? QD.unlimited : tier === 'plus' ? 10 : 5);
// Mutuals that happen while you're "away" wait for tonight's drop.
const dropQueue: (() => void)[] = [];
const nextDrop = () => { const d = new Date(); if (d.getHours() >= QD.dropHour) d.setDate(d.getDate() + 1); d.setHours(QD.dropHour, 0, 0, 0); return d.toISOString(); };
// Your own Dial in the demo: invented Dials from the last eight weeks, so there's something to see.
const myReceived: { at: number; looks: number; vibe: number; personality: number; score: number }[] = [];
for (let w = 7; w >= 0; w--) for (let k = 0; k < 3 + Math.floor(rnd() * 4); k++) {
  const looks = Math.round(52 + (7 - w) * 1.6 + rnd() * 22), vibe = Math.round(55 + rnd() * 25), personality = Math.round(60 + (7 - w) * 1.2 + rnd() * 22);
  myReceived.push({ at: Date.now() - w * 7 * 864e5 - rnd() * 6 * 864e5, looks, vibe, personality, ...{ score: weighted([{ kind: 'photo', score: looks }, { kind: 'video', score: vibe }, { kind: 'story', score: personality }]).score } });
}
const midnight = () => { const d = new Date(); d.setHours(24, 0, 0, 0); return d.toISOString(); };
const usedToday = () => [...scored.values()].length;   // the demo forgets everything on reload, so "today" is this visit

const REPLIES = [
  'Ha! Okay, you have my attention.', 'Honestly? That\'s the best opener I\'ve had on here.', 'Long story. Involves a goat. Drink first?',
  'Three words: tapas, bowling, rematch.', 'I was hoping you\'d message 😊', 'Right, you\'re going to have to prove that.',
];
const OPENERS_IN = ['Your Dial game is strong. What did I get? (Kidding, don\'t tell me.)', 'Okay, the {c} photo. Explain.', 'Hello from the other side of the Dial 👋'];

function openChat(p: DemoPerson, mutual: boolean) {
  const c = chats.get(p.id);
  if (c) { c.mutual = c.mutual || mutual; return c; }
  const fresh = { person: p, mutual, messages: [] as QMessage[], at: now() };
  chats.set(p.id, fresh); return fresh;
}

export const demoQuick: QuickApi = {
  mode: 'demo',
  async getProfile() { return profile; },
  async saveProfile(p) {
    if (!p.firstName.trim()) throw new Error('Add your first name');
    if (p.maxMiles) maxMiles = p.maxMiles;
    const age = (Date.now() - new Date(p.birthDate).getTime()) / (365.25 * 864e5);
    if (!(age >= 18)) throw new Error('Quick Dial is for over-18s only');
    const n = (k: string) => p.photos.filter((x) => x.kind === k).length;
    if (n('photo') < QD.photos) throw new Error(`Add ${QD.photos} photos`);
    if (n('video') < QD.videos) throw new Error('Add your talking video');
    if (n('story') < QD.stories) throw new Error(`Answer ${QD.stories} stories`);
    profile = p; changed();
  },
  async saveStories() { /* the demo keeps them with the profile */ },
  async saveBooth() { /* the demo keeps them with the profile */ },
  async setLocation() { /* the demo pretends you're in Leeds */ },
  async setMaxMiles(m) { maxMiles = m; changed(); },
  async getDeck() {
    const show = profile?.showMe ?? ['woman', 'man'];
    const open = everyone.filter((p) => show.includes(p.gender) && !scored.has(p.id) && !blocked.has(p.id) && (p.miles ?? 0) <= (profile?.maxMiles ?? maxMiles));
    // Same rules as the server: up to 3 who dialled you high, then the least-seen and nearest, shuffled.
    const liked = open.filter((p) => p.likesYou > 0.7).slice(0, 3);
    const rest = open.filter((p) => !liked.includes(p))
      .map((p) => ({ p, k: p.community.raters * 0.05 + (p.miles ?? 0) / (profile?.maxMiles ?? maxMiles) * 4 + rnd() * 6 }))
      .sort((a, b) => a.k - b.k).map((x) => x.p);
    const visible = tier !== 'free';
    const deck: QDeck = [...liked, ...rest].slice(0, QD.deckSize).map((p) => ({ ...p, dialledYou: visible ? liked.includes(p) : null }));
    deck.hiddenAdmirers = visible ? 0 : liked.length;
    return deck;
  },
  async getToday() { return { used: usedToday(), allowance: perDay() + extraToday, resetsAt: midnight(), tier, nextDrop: nextDrop() }; },
  async buyExtraRound() { extraToday += 1; changed(); },
  async dial(personId, mediaId, score) {
    if (score < 1 || score > 100) throw new Error('score_out_of_range');
    if (scored.has(personId)) throw new Error('already_scored');
    if (!dials.has(personId) && usedToday() >= perDay() + extraToday) throw new Error('daily_limit');
    const p = find(personId);
    const mine = dials.get(personId) ?? new Map(); dials.set(personId, mine); mine.set(mediaId, Math.round(score));
    if (mine.size < QD.perPerson) return { complete: false, dialled: mine.size };
    const scores = p.media.map((m) => ({ kind: m.kind, caption: m.caption, prompt: m.prompt, score: mine.get(m.id)! }));
    const b = weighted(scores);
    const avg = b.score;
    // Simulate their Dial of you: some people already dialled you, others do it in the next few seconds.
    const theirs = Math.round(35 + p.likesYou * 65);
    const already = p.likesYou > 0.7;
    const myScores = [...scored.values()].map((r) => r.score);
    const meHigh = isHigh(avg, [...myScores, avg]);
    const row: QCardRow = { id: p.id, firstName: p.firstName, age: p.age, look: p.look, ...b, mutual: false, dialledYou: already, scores };
    scored.set(p.id, row);
    openChat(p, false);
    const goMutual = () => {
      row.mutual = true; row.dialledYou = true; openChat(p, true);
      notify({ title: 'You\'re dialled in ✦', body: `${p.firstName} dialled you high too. Say hi while it's warm.`, withId: p.id });
      changed();
    };
    if (already && theirs >= QD.threshold && meHigh) { goMutual(); return { complete: true, ...b, mutual: true }; }
    if (!already) later(() => {
      if (blocked.has(p.id)) return;
      row.dialledYou = true;
      // They dialled you back high while you were away: it waits for tonight's 8pm drop.
      if (theirs >= QD.threshold && meHigh) {
        dropQueue.push(() => { row.mutual = true; openChat(p, true); });
        notify({ title: 'Something\'s waiting ✦', body: `${dropQueue.length} new in tonight's 8pm drop. No peeking.`, withId: '' });
      }
      else if (rnd() < 0.35) {   // anyone you dialled can message you, whatever the scores
        const c = openChat(p, false);
        c.messages.push({ id: uid('qmsg'), fromMe: false, body: pick(OPENERS_IN).replace('{c}', p.media[0].caption ?? 'first'), at: now() }); c.at = now();
        notify({ title: p.firstName, body: c.messages[c.messages.length - 1].body, withId: p.id });
      }
      changed();
    }, 3500 + rnd() * 5000);
    changed();
    return { complete: true, ...b, mutual: false };
  },
  async getCard() { return [...scored.values()].filter((r) => !blocked.has(r.id)).sort((a, b) => b.score - a.score); },
  async getChats() {
    return [...chats.values()].filter((c) => !blocked.has(c.person.id))
      .map((c) => {
        const last = c.messages[c.messages.length - 1];
        return { otherId: c.person.id, firstName: c.person.firstName, age: c.person.age, look: c.person.look, mutual: c.mutual,
          last: last?.body ?? null, lastFromMe: !!last?.fromMe, at: c.at };
      })
      .sort((a, b) => Number(b.mutual) - Number(a.mutual) || b.at.localeCompare(a.at));
  },
  async getMessages(otherId) { return [...(chats.get(otherId)?.messages ?? [])]; },
  async send(otherId, body) {
    const c = chats.get(otherId); if (!c) throw new Error('no_connection');
    if (blocked.has(otherId)) throw new Error('not_available');
    if (!c.mutual && c.messages.some((m) => m.fromMe) && !c.messages.some((m) => !m.fromMe)) throw new Error('wait_for_reply');
    c.messages.push({ id: uid('qmsg'), fromMe: true, body: body.trim(), at: now() }); c.at = now(); changed();
    later(() => {
      if (blocked.has(otherId)) return;
      c.messages.push({ id: uid('qmsg'), fromMe: false, body: pick(REPLIES), at: now() }); c.at = now();
      notify({ title: c.person.firstName, body: c.messages[c.messages.length - 1].body, withId: otherId }); changed();
    }, 1600 + rnd() * 1500);
  },
  async getMyDial(): Promise<MyDial> {
    const rows = myReceived;
    if (rows.length < QD.ownDialMinRaters) return { raters: rows.length, needed: QD.ownDialMinRaters };
    const avg = (f: (r: typeof rows[number]) => number) => Math.round(rows.reduce((a, r) => a + f(r), 0) / rows.length);
    const weeks = new Map<string, number[]>();
    for (const r of rows) {
      const d = new Date(r.at); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); const k = d.toISOString().slice(0, 10);
      weeks.set(k, [...(weeks.get(k) ?? []), r.score]);
    }
    const mine = profile?.photos ?? [];
    return {
      raters: rows.length, score: avg((r) => r.score), looks: avg((r) => r.looks), vibe: avg((r) => r.vibe), personality: avg((r) => r.personality),
      weeks: [...weeks].filter(([, v]) => v.length >= 3).sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, score: Math.round(v.reduce((a, b) => a + b, 0) / v.length), raters: v.length })),
      bestItem: mine.filter((m) => m.kind === 'story' && !m.id.startsWith('edited-'))[1]?.id ?? null,
      worstItem: mine.filter((m) => m.kind === 'photo' && !m.id.startsWith('new-'))[2]?.id ?? null,
    };
  },
  async getTheirDial(personId): Promise<TheirDial> {
    const p = find(personId);
    if (!p.community.show) return { available: false, reason: 'private' };
    if (p.community.raters < QD.theirDialMinRaters) return { available: false, reason: 'too_new' };
    if (tier === 'free') return { available: false, reason: 'upgrade' };
    const { raters, score, looks, vibe, personality } = p.community;
    return { available: true, raters, score, looks, vibe, personality };
  },
  async getSettings() { return { showDial, verified, tier, plansLive: true }; },   // the demo acts as if plans are live
  async setShowDial(v) { showDial = v; changed(); },
  async verify() { await new Promise((r) => setTimeout(r, 2200)); verified = true; changed(); },
  async getDrop() { return { at: nextDrop(), waiting: dropQueue.length }; },
  async openDropNow() {
    const n = dropQueue.length; dropQueue.splice(0).forEach((f) => f());
    if (n) notify({ title: 'Tonight\'s drop ✦', body: `${n} new mutual${n === 1 ? '' : 's'}. Go say hi!`, withId: '' });
    changed();
  },
  async tryTier(t) { tier = t; changed(); },
  async report(otherId, _reason, _detail, block = true) { if (block) await demoQuick.block(otherId); },
  async block(otherId) { blocked.add(otherId); changed(); },
  subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
  onNotice(l) { noticeListeners.add(l); return () => { noticeListeners.delete(l); }; },
};

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
function createSupabaseQuick(): QuickApi {
  const sb = supabaseApi!;
  const client = sb.client;
  const ok = <T,>(r: { data: T; error: any }) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((l) => l());
  const sign = async (paths: string[]) =>
    paths.length ? (ok(await client.storage.from('media').createSignedUrls(paths, 3600)) ?? []).map((s: any) => s.signedUrl as string) : [];
  const noLook: Look = {};
  return {
    mode: 'supabase',
    async getProfile() {
      const me = await sb.getMe(); if (!me) return null;
      const id = (await client.auth.getUser()).data.user!.id;
      const stories: any[] = ok(await client.from('quick_stories').select('id, prompt, answer, moderation').eq('owner', id).order('position')) ?? [];
      const booth: any[] = ok(await client.from('quick_booth').select('id, storage_path').eq('owner', id).order('position')) ?? [];
      const urls = await sign(booth.map((b) => b.storage_path));
      return {
        firstName: me.firstName, birthDate: '', gender: '', showMe: [],
        photos: [
          ...me.media.filter((m) => m.moderation !== 'rejected').map((m) => ({ id: m.id, kind: m.kind as 'photo' | 'video', url: m.url ?? null, caption: m.caption })),
          ...stories.filter((x) => x.moderation !== 'rejected').map((x) => ({ id: x.id, kind: 'story' as const, prompt: x.prompt, answer: x.answer })),
        ],
        booth: booth.map((b, k) => ({ id: b.id, kind: 'photo' as const, url: urls[k] ?? null })),
      };
    },
    async saveProfile() { changed(); },
    async saveBooth(uris) {
      const id = (await client.auth.getUser()).data.user!.id;
      for (let k = 0; k < uris.length; k++) {
        const body = await (await fetch(uris[k])).arrayBuffer();
        const path = `${id}/booth/${Date.now()}-${k + 1}.jpg`;
        ok(await client.storage.from('media').upload(path, body, { contentType: 'image/jpeg' }));
        ok(await client.from('quick_booth').upsert({ owner: id, position: k + 1, storage_path: path }, { onConflict: 'owner,position' }));
      }
      changed();
    },
    async setLocation(lat, lng) { ok(await client.rpc('set_location', { p_lat: lat, p_lng: lng })); changed(); },
    async setMaxMiles(m) { ok(await client.rpc('set_max_distance', { p_miles: m })); changed(); },
    async saveStories(stories) {
      const id = (await client.auth.getUser()).data.user!.id;
      ok(await client.from('quick_stories').upsert(stories.map((x, k) => ({ owner: id, position: k + 1, prompt: x.prompt, answer: x.answer.trim() })), { onConflict: 'owner,position' }));
      changed();
    },   // name, birthday and preferences are saved at sign-up; photos upload as they're added
    async getDeck() {
      const rows: any[] = ok(await client.rpc('quick_deck')) ?? [];
      const paths = rows.flatMap((r) => [...(r.items ?? []).filter((m: any) => m.storage_path).map((m: any) => m.storage_path), ...(r.booth ?? [])]);
      const urls = await sign(paths);
      const url = new Map(paths.map((p, i) => [p, urls[i]]));
      const deck: any = rows.map((r) => ({ id: r.id, firstName: r.first_name, age: r.age, city: r.city, look: noLook, verified: r.verified, miles: r.miles, dialledYou: r.dialled_you,
        booth: (r.booth ?? []).map((p: string, k: number) => ({ id: `${r.id}-booth-${k}`, kind: 'photo' as const, url: url.get(p) ?? null })),
        media: (r.items ?? []).map((m: any) => ({ id: m.id, kind: m.kind, caption: m.caption, prompt: m.prompt, answer: m.answer,
          url: m.storage_path ? url.get(m.storage_path) ?? null : null })) }));
      deck.hiddenAdmirers = rows[0]?.hidden_admirers ?? 0;
      return deck;
    },
    async getToday() {
      const r: any = (ok(await client.rpc('quick_today')) as any[])?.[0];
      return { used: r.used, allowance: r.allowance, resetsAt: r.resets_at, tier: r.tier, nextDrop: r.next_drop };
    },
    async buyExtraRound() { throw new Error('Extra rounds arrive with in-app purchases. Coming soon.'); },
    async dial(_personId, mediaId, score) {
      const r: any = ok(await client.rpc('quick_dial', { p_item: mediaId, p_score: Math.round(score) }));
      if (r.complete) changed();
      return r;
    },
    async getCard() {
      const rows: any[] = ok(await client.rpc('quick_card')) ?? [];
      const mine: any[] = ok(await client.from('quick_dials').select('subject, item_id, kind, score')) ?? [];
      return rows.map((r) => ({ id: r.subject, firstName: r.first_name, age: r.age, look: noLook, score: r.score, looks: r.looks, vibe: r.vibe, personality: r.personality,
        mutual: r.mutual, dialledYou: r.dialled_you,
        scores: mine.filter((d) => d.subject === r.subject).map((d) => ({ kind: d.kind, score: d.score })) }));
    },
    async getChats() {
      const rows: any[] = ok(await client.rpc('quick_chats')) ?? [];
      return rows.map((r) => ({ otherId: r.other, firstName: r.first_name, age: r.age, look: noLook, mutual: r.mutual, last: r.last_body, lastFromMe: !!r.last_from_me, at: r.last_at }));
    },
    async getMessages(otherId) {
      const me = (await client.auth.getUser()).data.user!.id;
      const [a, b] = [me, otherId].sort();
      const rows: any[] = ok(await client.from('quick_messages').select('id, sender, body, created_at').eq('user_a', a).eq('user_b', b).order('created_at')) ?? [];
      return rows.map((m) => ({ id: m.id, fromMe: m.sender === me, body: m.body, at: m.created_at }));
    },
    async send(otherId, body) { ok(await client.rpc('quick_send', { p_other: otherId, p_body: body })); changed(); },
    async getMyDial() {
      const d: any = ok(await client.rpc('my_quick_dial'));
      if ('needed' in d) return d;
      return { raters: d.raters, score: +d.score, looks: +d.looks, vibe: +d.vibe, personality: +d.personality, weeks: (d.weeks ?? []).map((w: any) => ({ week: w.week, score: +w.score, raters: +w.raters })), bestItem: d.best_item, worstItem: d.worst_item };
    },
    async getTheirDial(personId) {
      const d: any = ok(await client.rpc('quick_their_dial', { p_subject: personId }));
      return d.available ? { available: true, raters: d.raters, score: +d.score, looks: +d.looks, vibe: +d.vibe, personality: +d.personality } : d;
    },
    async getSettings() {
      const id = (await client.auth.getUser()).data.user!.id;
      const p: any = ok(await client.from('profiles').select('quick_show_dial, verified_at, age_verified_at').eq('id', id).single());
      const t: any = (ok(await client.rpc('quick_today')) as any[])?.[0];
      return { showDial: p.quick_show_dial, verified: !!(p.verified_at && p.age_verified_at), tier: t?.tier ?? 'free', plansLive: false };
    },
    async setShowDial(v) { ok(await client.rpc('set_quick_show_dial', { p_show: v })); changed(); },
    async verify() {
      const r: any = ok(await client.functions.invoke('verify-start'));
      if (r?.error) throw new Error(r.error);
      await WebBrowser.openBrowserAsync(r.url);      // the provider calls verify-webhook; we refresh when they come back
      changed();
    },
    async getDrop() {
      const t: any = (ok(await client.rpc('quick_today')) as any[])?.[0];
      return { at: t?.next_drop, waiting: 0 };   // the drop's contents stay a surprise until 8pm
    },
    async report(otherId, reason, detail, block = true) { await sb.reportMember(otherId, reason as any, detail, block); changed(); },
    async block(otherId) { await sb.blockMember(otherId); changed(); },
    subscribe(l) {
      listeners.add(l);
      const ch = client.channel('quick')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_messages' }, () => l())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_connections' }, () => l())
        .subscribe();
      return () => { listeners.delete(l); client.removeChannel(ch); };
    },
    onNotice(l) {
      // In the foreground, show new notifications as the in-app banner; in the background the phone shows the push.
      const ch = client.channel('quick-notices')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' },
          (p: any) => l({ title: p.new.title, body: p.new.body, withId: p.new.data?.with }))
        .subscribe();
      return () => { client.removeChannel(ch); };
    },
  };
}

export const quick: QuickApi = supabaseApi ? createSupabaseQuick() : demoQuick;
