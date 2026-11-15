// Mirrors public.economy in the database. The server is the authority; these values
// are for display and for the demo data source only.
export const ECONOMY = {
  openerReplied: 10,
  openerDailyCap: 3,
  level: { 2: 10, 3: 20, 4: 30, 5: 40 } as Record<number, number>,
  voiceExchange: 15,
  conversationWeeklyCap: 300,
  dateConfirmed: 200,
  dateMutualPositive: 50,
  openConversationSlots: 8,
  ratingMinRaters: 5,
} as const;

export const CHAPTERS = [
  { number: 1, numeral: 'I', name: 'Opening Line', ink: 0, colour: '#9A96A8' },
  { number: 2, numeral: 'II', name: 'Good Company', ink: 500, colour: '#7E8AA8' },
  { number: 3, numeral: 'III', name: 'Scene Stealer', ink: 1500, colour: '#5B74D6' },
  { number: 4, numeral: 'IV', name: 'Storyteller', ink: 3500, colour: '#4A57E8' },
  { number: 5, numeral: 'V', name: 'Headliner', ink: 7000, colour: '#7055D8' },
  { number: 6, numeral: 'VI', name: 'Luminary', ink: 12000, colour: '#B8913F' },
  { number: 7, numeral: 'VII', name: 'Icon', ink: 20000, colour: '#B8913F' },
] as const;

export type Chapter = (typeof CHAPTERS)[number];

export function chapterFor(ink: number): Chapter {
  let current: Chapter = CHAPTERS[0];
  for (const c of CHAPTERS) if (ink >= c.ink) current = c;
  return current;
}

/** Progress towards the next Chapter. `next` is null at Chapter VII. */
export function chapterProgress(ink: number) {
  const current = chapterFor(ink);
  const next = CHAPTERS.find((c) => c.number === current.number + 1) ?? null;
  if (!next) return { current, next, inkToNext: 0, fraction: 1 };
  return {
    current,
    next,
    inkToNext: next.ink - ink,
    fraction: (ink - current.ink) / (next.ink - current.ink),
  };
}

export const LEVEL_NAMES = ['Matched', 'First Contact', 'Getting to Know You', 'Building Chemistry', 'Real Connection', 'Date Ready'];

export type ConversationStats = {
  messagesA: number; messagesB: number;
  questionsA: number; questionsB: number;
  voiceA: number; voiceB: number;
  activeDays: number; meetIntents: number;
  gamesCompleted?: number;
};

/** Same rule as app.recalc_level in the database. Levels never go down. */
export function conversationLevel(s: ConversationStats, current = 0): number {
  const total = s.messagesA + s.messagesB;
  const share = total > 0 ? Math.max(s.messagesA, s.messagesB) / total : 1;
  let level = 0;
  if (s.messagesA >= 1 && s.messagesB >= 1) level = 1;
  if (level === 1 && s.messagesA >= 10 && s.messagesB >= 10 && s.activeDays >= 2) level = 2;
  if (level === 2 && s.activeDays >= 3 && s.questionsA >= 1 && s.questionsB >= 1 && share <= 0.65) level = 3;
  if (level === 3 && ((s.voiceA >= 1 && s.voiceB >= 1) || (s.gamesCompleted ?? 0) >= 1)) level = 4;
  if (level === 4 && s.meetIntents >= 2) level = 5;
  return Math.max(level, current);
}
