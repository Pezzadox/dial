// Playful compatibility insight, not a scientific or clinical assessment.
export type Traits = Partial<Record<
  'humour' | 'openness' | 'talkative' | 'planner' | 'socialEnergy' | 'activity' | 'replyPace' | 'curiosity' | 'creativity', number>>; // each 0..1

export type CompatProfile = {
  intentions?: string | null;
  wantsChildren?: boolean | null;
  interests: string[];
  traits: Traits;
};

export const COMPAT_WEIGHTS = { intentions: 30, personality: 25, lifestyle: 20, interests: 15, rhythm: 10 } as const;

const similar = (a?: number, b?: number) => (a == null || b == null ? 0.5 : 1 - Math.abs(a - b));
// Complementary traits score best when two people sit on opposite sides, without being extremes apart.
const complementary = (a?: number, b?: number) => {
  if (a == null || b == null) return 0.5;
  const gap = Math.abs(a - b);
  return 1 - Math.abs(gap - 0.5) * 1.2;
};
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function compatibility(me: CompatProfile, them: CompatProfile) {
  const reasons: { score: number; text: string }[] = [];

  let intentions = 0.5;
  if (me.intentions && them.intentions) intentions = me.intentions === them.intentions ? 1 : 0.25;
  if (me.wantsChildren != null && them.wantsChildren != null)
    intentions = intentions * 0.7 + (me.wantsChildren === them.wantsChildren ? 0.3 : 0);
  if (intentions >= 0.9 && them.intentions) reasons.push({ score: intentions * COMPAT_WEIGHTS.intentions, text: `You both want ${them.intentions}` });

  const humour = similar(me.traits.humour, them.traits.humour);
  const openness = similar(me.traits.openness, them.traits.openness);
  const talk = clamp01(complementary(me.traits.talkative, them.traits.talkative));
  const plan = clamp01(complementary(me.traits.planner, them.traits.planner));
  const personality = (humour + openness + talk + plan) / 4;
  if (humour >= 0.85) reasons.push({ score: humour * 8, text: 'You laugh at the same things' });
  if (plan >= 0.8 && me.traits.planner != null && them.traits.planner != null)
    reasons.push({ score: plan * 7, text: me.traits.planner > them.traits.planner ? 'You plan, they improvise' : 'They plan, you improvise' });
  if (talk >= 0.8 && me.traits.talkative != null && them.traits.talkative != null)
    reasons.push({ score: talk * 6, text: me.traits.talkative > them.traits.talkative ? 'You talk, they listen' : 'They talk, you listen' });

  const lifestyle = (similar(me.traits.socialEnergy, them.traits.socialEnergy) + similar(me.traits.activity, them.traits.activity)) / 2;
  if (lifestyle >= 0.85) reasons.push({ score: lifestyle * 6, text: 'Similar pace of life' });

  const mine = new Set(me.interests.map((i) => i.toLowerCase()));
  const shared = them.interests.filter((i) => mine.has(i.toLowerCase()));
  const union = new Set([...mine, ...them.interests.map((i) => i.toLowerCase())]).size || 1;
  const interests = clamp01((shared.length / union) * 2.5);
  if (shared.length) reasons.push({ score: interests * COMPAT_WEIGHTS.interests, text: `You're both into ${shared.slice(0, 2).join(' and ')}` });

  const rhythm = similar(me.traits.replyPace, them.traits.replyPace);

  const percent = Math.round(
    intentions * COMPAT_WEIGHTS.intentions + personality * COMPAT_WEIGHTS.personality +
    lifestyle * COMPAT_WEIGHTS.lifestyle + interests * COMPAT_WEIGHTS.interests + rhythm * COMPAT_WEIGHTS.rhythm);

  return {
    percent,
    shared,
    reasons: reasons.sort((a, b) => b.score - a.score).slice(0, 3).map((r) => r.text),
  };
}
