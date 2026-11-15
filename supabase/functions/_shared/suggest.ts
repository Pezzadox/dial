// Builds the prompt for AI reply ideas and reads the answer. Pure: no network, no Deno APIs,
// so it is unit-tested alongside the app and used by the edge function.

export const TONES = {
  playful: 'light, witty and a little teasing, never mean',
  curious: 'genuinely curious: ask something specific that invites a story, not a yes or no',
  deeper: 'warm and a bit more personal: move past small talk to values, memories or what matters to them',
  ask_out: 'confident and kind: suggest meeting in person with a concrete, low-pressure idea that fits what they have talked about',
} as const;
export type Tone = keyof typeof TONES;

export type SuggestInput = {
  tone: Tone;
  myName: string;
  theirName: string;
  sharedInterests: string[];
  theirInterests: string[];
  level: number;                                   // conversation level 0..5
  messages: { mine: boolean; text: string }[];     // oldest first; theirs only if they consented
  theirsIncluded: boolean;
};

export function buildSuggestPrompt(i: SuggestInput) {
  const system = [
    'You help someone on Dial, a dating app, keep a conversation going. You write three short reply options they could send, in their own voice.',
    'Every option must move the conversation forward: ask an open question, pick up a specific detail, share something about themselves, or suggest a next step. Never just "haha" or "nice".',
    `Tone: ${TONES[i.tone]}.`,
    'Rules: British English. Each option under 140 characters. Kind and respectful. No sexual content, no pressure, no pick-up lines, no flattery about looks or body, no assumptions about gender. Do not invent facts about either person. Never mention that you are an AI.',
    'Reply with only a JSON array of three strings.',
  ].join('\n');
  const convo = i.messages.slice(-16).map((m) => `${m.mine ? i.myName : i.theirName}: ${m.text.slice(0, 400)}`).join('\n');
  const user = [
    `They are talking to ${i.theirName}.`,
    i.sharedInterests.length ? `Shared interests: ${i.sharedInterests.join(', ')}.` : 'No shared interests listed.',
    i.theirInterests.length ? `${i.theirName}'s interests: ${i.theirInterests.join(', ')}.` : '',
    `Conversation level ${i.level} of 5${i.level >= 4 ? ': they know each other a little, so meeting up is a natural next step' : ''}.`,
    convo ? `Conversation so far${i.theirsIncluded ? '' : ` (only ${i.myName}'s own messages are shared, ${i.theirName} has not opted in)`}:\n${convo}` : 'They have just matched and nobody has written yet. Write openers.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

/** Reads three suggestions from the model's reply; tolerant of extra text around the JSON. */
export function parseSuggestions(text: string): string[] {
  const clean = (xs: unknown[]) => xs.filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim().replace(/^["“]|["”]$/g, '')).filter((s) => s.length > 0 && s.length <= 200).slice(0, 3);
  const m = text.match(/\[[\s\S]*\]/);
  if (m) { try { const arr = JSON.parse(m[0]); if (Array.isArray(arr)) return clean(arr); } catch { /* fall through */ } }
  return clean(text.split('\n').map((l) => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '')));
}
