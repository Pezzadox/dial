// Standing: the private score out of 100. Every component is 0..100 and starts at a
// neutral 50 until there is evidence. Matches and likes received carry no weight.
export const STANDING_WEIGHTS = {
  communication: 20,
  connection: 20,
  dateExperience: 15,
  effort: 10,
  character: 10,      // Personality, Entertainment, Creativity and Curiosity combined
  presentation: 10,   // from power-gauge ratings of photos and videos
  community: 10,
  consistency: 5,
} as const;

export type StandingInputs = Partial<Record<keyof typeof STANDING_WEIGHTS, number | null>>;

export function standing(inputs: StandingInputs): number {
  let total = 0;
  for (const key of Object.keys(STANDING_WEIGHTS) as (keyof typeof STANDING_WEIGHTS)[]) {
    const v = inputs[key];
    total += (STANDING_WEIGHTS[key] * Math.min(100, Math.max(0, v == null ? 50 : v))) / 100;
  }
  return Math.round(total);
}

/** Pull a small sample towards neutral so a handful of ratings cannot swing a score. */
export function smoothed(mean: number, n: number, prior = 50, priorWeight = 5): number {
  return (mean * n + prior * priorWeight) / (n + priorWeight);
}
