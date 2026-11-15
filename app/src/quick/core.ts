// Quick Dial's rules, kept pure so they can be tested and shared with the server's numbers.
import type { Look } from '../core/looks';

/** A Quick set is 5 photos (looks), 1 talking video (vibe) and 5 short stories (personality). */
export const QD = {
  threshold: 70, photos: 5, videos: 1, stories: 5, perPerson: 11, deckSize: 10, rounds: 3,
  weights: { looks: 40, vibe: 20, personality: 40 },
  booth: 3, unlimited: 999, highFloor: 55, ownDialMinRaters: 5, theirDialMinRaters: 10, dropHour: 20,
} as const;

export const STORY_PROMPTS = [
  'My most useless talent', 'The way to win me over', 'A perfect Sunday', 'I\'ll never shut up about',
  'My friends would say I\'m', 'The best trip I\'ve taken', 'A green flag I look for', 'My go-to karaoke song',
  'Something I\'m weirdly good at', 'My hottest take', 'The last thing that made me laugh out loud', 'I\'m happiest when',
];
export const STORY_MAX = 140;

export const average = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

export type QKind = 'photo' | 'video' | 'story';
/** One of the 11 things you dial: a photo, the talking video, or a story (prompt + answer). */
export type QMedia = {
  id: string; kind: QKind; caption?: string | null; url?: string | null; palette?: [string, string];
  prompt?: string; answer?: string;
};
/** booth: their three photobooth selfies, which rotate in their circle on the deck. miles: rounded, never below 1. */
export type QPerson = { id: string; firstName: string; age: number; city?: string | null; look: Look; verified?: boolean; miles?: number | null; booth?: QMedia[]; media: QMedia[];
  /** They dialled you high. Only filled in when you can see it (Quick+, or everyone before plans go live). */
  dialledYou?: boolean | null };

/** "High" = 70+, or the top 30% of your own Dials once you've given 3 (never below 55). Matches app.is_high. */
export function isHigh(score: number, myScores: number[]): boolean {
  if (score >= QD.threshold) return true;
  if (score < QD.highFloor || myScores.length < 3) return false;
  const xs = [...myScores].sort((a, b) => a - b);
  const pos = 0.7 * (xs.length - 1), lo = Math.floor(pos);
  const p70 = xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (pos - lo);
  return score >= p70;
}
export const DISTANCES = [5, 10, 25, 50, 100] as const;
export const milesLabel = (m: number | null | undefined) => (m == null ? '' : m <= 1 ? 'under a mile' : `${m} mi`);
export type QBreakdown = { score: number; looks: number; vibe: number; personality: number };
export type QCardRow = QBreakdown & {
  id: string; firstName: string; age: number; look: Look;
  mutual: boolean; dialledYou: boolean; scores: { kind: QKind; caption?: string | null; prompt?: string; score: number }[];
};

export const SECTION: Record<QKind, 'Looks' | 'Vibe' | 'Personality'> = { photo: 'Looks', video: 'Vibe', story: 'Personality' };

/** Weighted score: 40% looks, 20% vibe, 40% personality. Matches the server exactly. */
export function weighted(scores: { kind: QKind; score: number }[]): QBreakdown {
  const of = (k: QKind) => average(scores.filter((s) => s.kind === k).map((s) => s.score));
  const looks = of('photo'), vibe = of('video'), personality = of('story');
  const w = QD.weights;
  const score = Math.max(1, Math.min(100, Math.round((looks * w.looks + vibe * w.vibe + personality * w.personality) / (w.looks + w.vibe + w.personality))));
  return { score, looks, vibe, personality };
}
export type QStatus = 'mutual' | 'waiting' | 'open';

/** Mutual when both are high; "waiting" when you're high and they haven't dialled you yet; otherwise open to chat. */
export function status(row: Pick<QCardRow, 'score' | 'mutual' | 'dialledYou'>): QStatus {
  if (row.mutual) return 'mutual';
  if (row.score >= QD.threshold && !row.dialledYou) return 'waiting';
  return 'open';
}

export const STATUS_LABEL: Record<QStatus, string> = { mutual: 'Dialled in ✦', waiting: 'Waiting on their Dial', open: 'Open to chat' };

export type QStats = {
  count: number; average: number; highest: QCardRow | null; highCount: number; mutuals: number;
  style: 'Generous' | 'Balanced' | 'Selective';
  looksAvg: number; personalityAvg: number; vibeAvg: number;
  leansOn: 'looks' | 'personality' | 'balance';
  drawnTo: string[];                // looks you dial high, in plain words, most common first
};

export function cardStats(rows: QCardRow[]): QStats {
  const avg = average(rows.map((r) => r.score));
  const looksAvg = average(rows.map((r) => r.looks)), personalityAvg = average(rows.map((r) => r.personality)), vibeAvg = average(rows.map((r) => r.vibe));
  const high = rows.filter((r) => r.score >= QD.threshold);
  const counts = new Map<string, number>();
  const bump = (k: string | null | undefined) => { if (k) counts.set(k, (counts.get(k) ?? 0) + 1); };
  for (const r of high) {
    bump(r.look.hairColour && `${r.look.hairColour} hair`);
    bump(r.look.eyeColour && `${r.look.eyeColour} eyes`);
    bump(r.look.build && `${r.look.build === 'plus' ? 'plus-size' : r.look.build} build`);
  }
  const drawnTo = [...counts].filter(([, n]) => n >= 2 || high.length <= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
  return {
    count: rows.length,
    average: avg,
    highest: rows.length ? rows.reduce((a, b) => (b.score > a.score ? b : a)) : null,
    highCount: high.length,
    mutuals: rows.filter((r) => r.mutual).length,
    style: avg >= 70 ? 'Generous' : avg >= 45 ? 'Balanced' : 'Selective',
    looksAvg, personalityAvg, vibeAvg,
    leansOn: personalityAvg - looksAvg >= 8 ? 'personality' : looksAvg - personalityAvg >= 8 ? 'looks' : 'balance',
    drawnTo,
  };
}

/** Openers for a mutual: built from the photo or video you dialled highest, so nobody has to start with "hey". */
export function openers(row: Pick<QCardRow, 'firstName' | 'scores'>): string[] {
  const story = [...row.scores].filter((s) => s.kind === 'story').sort((a, b) => b.score - a.score)[0];
  const best = [...row.scores].sort((a, b) => b.score - a.score)[0];
  const about = best?.caption ? `your "${best.caption}" ${best.kind}` : `your ${best?.kind ?? 'photo'}`;
  return [
    story?.prompt ? `Your answer to "${story.prompt}" got my highest Dial. Tell me more?` : `I dialled ${about} the highest. What's the story behind it?`,
    `We both dialled high, so: perfect first date, three words. Go.`,
    `What's the best thing that's happened to you this week, ${row.firstName}?`,
  ];
}

/** Server and demo errors in plain words. */
export function friendly(e: unknown): string {
  const m = String((e as any)?.message ?? e);
  if (m.includes('daily_limit')) return 'That\'s today\'s rounds. Fresh faces at midnight.';
  if (m.includes('wait_for_reply')) return 'One message until they reply. Keeps everyone\'s inbox kind.';
  if (m.includes('not_available')) return 'This person isn\'t available any more.';
  if (m.includes('already_scored')) return 'You\'ve already dialled them.';
  if (m.includes('verification_not_configured')) return 'Verification isn\'t switched on yet.';
  if (m.includes('Coming soon')) return m;
  return m;
}

/** "3h 12m" until a time. */
export function until(iso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  const h = Math.floor(ms / 3.6e6), m = Math.floor((ms % 3.6e6) / 6e4);
  return h ? `${h}h ${m}m` : `${m}m`;
}

// ---------------------------------------------------------------------------
// Your own Dial, over time
// ---------------------------------------------------------------------------
export type MyDial =
  | { raters: number; needed: number }
  | (QBreakdown & { raters: number; weeks: { week: string; score: number; raters: number }[]; bestItem: string | null; worstItem: string | null });

export const hasDial = (d: MyDial): d is Exclude<MyDial, { needed: number }> => !('needed' in d);

/** One kind, practical tip from your own Dial. Never "you're not attractive": always something to try. */
export function dialTip(d: Exclude<MyDial, { needed: number }>): string {
  if (d.personality - d.looks >= 8) return 'People love your stories more than your photos. Lead with your best photo of you doing something you love.';
  if (d.looks - d.personality >= 8) return 'Your photos land. Make your stories more specific: a name, a place, a detail. It gives people something to reply to.';
  if (d.vibe < Math.min(d.looks, d.personality) - 8) return 'Your talking video is the weak spot. Try a new one in daylight, closer to the camera, saying one thing you\'re excited about.';
  const w = d.weeks;
  if (w.length >= 2 && w[w.length - 1].score > w[0].score) return `You're up ${w[w.length - 1].score - w[0].score} since you started. Whatever you changed, it's working.`;
  return 'Nicely balanced. Swap in a fresh photo every few weeks to keep it current.';
}

// ---------------------------------------------------------------------------
// Plans: built now, switched on once there are enough people. Prices are placeholders.
// ---------------------------------------------------------------------------
export type Tier = 'free' | 'plus' | 'gold';
export const PLANS: { tier: Tier; name: string; price: string; perDay: number; perks: string[] }[] = [
  { tier: 'free', name: 'Quick', price: 'Free', perDay: 5, perks: ['5 people a day (50 to browse)', 'Your own Dial over time', 'Chat with everyone you dial', 'Tonight\'s 8pm drop'] },
  { tier: 'plus', name: 'Quick+', price: '£5.99 a month', perDay: 10, perks: ['10 people a day (100 to browse)', 'See the Dial of people you\'re into', 'See who dialled you high', 'Your Dial by photo and story'] },
  { tier: 'gold', name: 'Quick Gold', price: '£14.99 a month', perDay: 999, perks: ['Unlimited people a day', 'Everything in Quick+', 'Weekly spotlight: shown first in decks', 'Undo a submitted Dial once a day'] },
];
export const isUnlimited = (perDay: number) => perDay >= QD.unlimited;
export const perDayLabel = (perDay: number) => (isUnlimited(perDay) ? 'Unlimited people a day' : `${perDay} people a day`);
