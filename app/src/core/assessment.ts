// The personality game: short scenario questions. Each answer nudges one or more traits (0..1).
// A playful profile insight for matchmaking, not a clinical or scientific assessment.
export type Option = { label: string; traits: Record<string, number> };
export type Question = { id: string; prompt: string; options: Option[] };

export const PERSONALITY: Question[] = [
  { id: 'saturday', prompt: 'A Saturday with nothing planned. You…', options: [
    { label: 'Booked something by Wednesday', traits: { planner: 0.9 } },
    { label: 'See where the day takes you', traits: { planner: 0.15 } },
    { label: 'Have a loose plan and a backup', traits: { planner: 0.55 } } ] },
  { id: 'party', prompt: 'At a party you are usually…', options: [
    { label: 'Telling the story everyone gathers for', traits: { talkative: 0.9, socialEnergy: 0.85 } },
    { label: 'Asking the questions', traits: { talkative: 0.3, socialEnergy: 0.6 } },
    { label: 'In the kitchen with two good people', traits: { talkative: 0.5, socialEnergy: 0.3 } } ] },
  { id: 'laugh', prompt: 'How often do friends say you made them laugh?', options: [
    { label: 'Rarely', traits: { humour: 0.15 } }, { label: 'Now and then', traits: { humour: 0.4 } },
    { label: 'Often', traits: { humour: 0.7 } }, { label: 'Constantly. It is a problem', traits: { humour: 0.95 } } ] },
  { id: 'trip', prompt: 'A friend suggests a trip somewhere you have never heard of.', options: [
    { label: "I'm in. When do we leave?", traits: { openness: 0.95 } },
    { label: "Send me a link and I'll read up", traits: { openness: 0.6 } },
    { label: "I'd rather go back somewhere I love", traits: { openness: 0.25 } } ] },
  { id: 'weeknight', prompt: 'A free weeknight evening is best spent…', options: [
    { label: 'Running, climbing, a class', traits: { activity: 0.9 } },
    { label: 'A long walk and dinner', traits: { activity: 0.6 } },
    { label: 'Sofa, film, no regrets', traits: { activity: 0.2 } } ] },
  { id: 'replies', prompt: 'You tend to reply to messages…', options: [
    { label: 'Within minutes', traits: { replyPace: 0.9 } },
    { label: 'Same day', traits: { replyPace: 0.6 } },
    { label: "When I've got something good to say", traits: { replyPace: 0.3 } } ] },
  { id: 'recharge', prompt: 'After a big week you recharge with…', options: [
    { label: 'A full room of friends', traits: { socialEnergy: 0.9 } },
    { label: 'One close friend', traits: { socialEnergy: 0.5 } },
    { label: 'Time on your own', traits: { socialEnergy: 0.15 } } ] },
  { id: 'rabbit', prompt: 'How often do you fall down an internet rabbit hole?', options: [
    { label: 'Hardly ever', traits: { curiosity: 0.2 } }, { label: 'Most weeks', traits: { curiosity: 0.6 } },
    { label: 'I am in one right now', traits: { curiosity: 0.95 } } ] },
];

/** Averages each trait over the answers that touched it. */
export function scoreAnswers(questions: Question[], answers: Record<string, number>): Record<string, number> {
  const sums: Record<string, [number, number]> = {};
  for (const q of questions) {
    const opt = q.options[answers[q.id]];
    if (!opt) continue;
    for (const [k, v] of Object.entries(opt.traits)) { const s = (sums[k] ??= [0, 0]); s[0] += v; s[1] += 1; }
  }
  return Object.fromEntries(Object.entries(sums).map(([k, [t, n]]) => [k, Math.round((t / n) * 100) / 100]));
}

/** Two or three plain-language highlights shown on the profile card. */
export function highlights(t: Record<string, number>): string[] {
  const out: [number, string][] = [];
  const add = (v: number | undefined, hi: string, lo: string) => {
    if (v == null) return;
    if (v >= 0.7) out.push([v, hi]); else if (v <= 0.3) out.push([1 - v, lo]);
  };
  add(t.planner, 'Planner', 'Spontaneous');
  add(t.talkative, 'Storyteller', 'Listener');
  add(t.humour, 'Quick to laugh', 'Dry wit');
  add(t.openness, 'Adventurous', 'Knows what they love');
  add(t.activity, 'Always moving', 'Slow evenings');
  add(t.socialEnergy, 'Social butterfly', 'Small circles');
  add(t.curiosity, 'Endlessly curious', 'Focused');
  return out.sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, s]) => s);
}

/** The same scenarios, answered for the partner you would wish for. Builds your ideal partner. */
export const IDEAL_PARTNER: Question[] = [
  { id: 'saturday', prompt: 'A Saturday with nothing planned. Your ideal partner…', options: [
    { label: 'Has booked something by Wednesday', traits: { planner: 0.9 } },
    { label: 'Suggests seeing where the day goes', traits: { planner: 0.15 } },
    { label: 'Has a loose plan and a backup', traits: { planner: 0.55 } } ] },
  { id: 'party', prompt: 'At a party, you would love them to be…', options: [
    { label: 'Telling the story everyone gathers for', traits: { talkative: 0.9, socialEnergy: 0.85 } },
    { label: 'Asking people questions', traits: { talkative: 0.3, socialEnergy: 0.6 } },
    { label: 'In the kitchen with you and two good people', traits: { talkative: 0.5, socialEnergy: 0.3 } } ] },
  { id: 'laugh', prompt: 'How much should they make you laugh?', options: [
    { label: 'Not essential', traits: { humour: 0.2 } }, { label: 'Now and then', traits: { humour: 0.45 } },
    { label: 'Often', traits: { humour: 0.7 } }, { label: 'Constantly', traits: { humour: 0.95 } } ] },
  { id: 'trip', prompt: 'You suggest a trip somewhere neither of you knows. They…', options: [
    { label: 'Say yes before you finish the sentence', traits: { openness: 0.95 } },
    { label: 'Ask for a link and read up', traits: { openness: 0.6 } },
    { label: 'Suggest somewhere you both love instead', traits: { openness: 0.25 } } ] },
  { id: 'weeknight', prompt: 'On a free weeknight, they would most likely be…', options: [
    { label: 'Running, climbing, at a class', traits: { activity: 0.9 } },
    { label: 'Out for a long walk and dinner', traits: { activity: 0.6 } },
    { label: 'On the sofa with a film', traits: { activity: 0.2 } } ] },
  { id: 'replies', prompt: 'When you message them, they reply…', options: [
    { label: 'Within minutes', traits: { replyPace: 0.9 } },
    { label: 'The same day', traits: { replyPace: 0.6 } },
    { label: "When they've got something good to say", traits: { replyPace: 0.3 } } ] },
  { id: 'recharge', prompt: 'After a hard week, they recharge with…', options: [
    { label: 'A full room of friends', traits: { socialEnergy: 0.9 } },
    { label: 'One close friend, or you', traits: { socialEnergy: 0.5 } },
    { label: 'Time on their own', traits: { socialEnergy: 0.15 } } ] },
  { id: 'rabbit', prompt: 'How curious should they be?', options: [
    { label: 'Settled in what they love', traits: { curiosity: 0.2 } }, { label: 'Curious now and then', traits: { curiosity: 0.6 } },
    { label: 'Always down a new rabbit hole', traits: { curiosity: 0.95 } } ] },
];
