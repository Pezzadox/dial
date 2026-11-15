// Looks, the ideal partner and the three matching columns.
// Looks use only what members declare about themselves. No photo or face analysis.
import type { Traits } from './compatibility';

export const HAIR = ['black', 'brunette', 'auburn', 'red', 'blonde', 'grey', 'other'] as const;
export const HAIR_LENGTH = ['short', 'medium', 'long'] as const;
export const EYES = ['brown', 'hazel', 'green', 'blue', 'grey'] as const;
export const BUILD = ['slim', 'athletic', 'average', 'curvy', 'plus'] as const;
export const HEIGHT_BANDS = [
  { label: 'Any height', min: null, max: null },
  { label: 'Under 165 cm', min: 120, max: 164 },
  { label: '165 to 180 cm', min: 165, max: 180 },
  { label: 'Over 180 cm', min: 181, max: 230 },
] as const;

/** Each vibe is a light personality flavour that sits on top of the shared ideal partner. */
export const VIBES: Record<string, Traits> = {
  bubbly: { socialEnergy: 0.85, talkative: 0.8 },
  playful: { humour: 0.85 },
  warm: { humour: 0.7, socialEnergy: 0.6 },
  calm: { socialEnergy: 0.3, talkative: 0.35 },
  adventurous: { openness: 0.9, activity: 0.75 },
  sporty: { activity: 0.9 },
  thoughtful: { curiosity: 0.8, talkative: 0.4 },
};

export type Look = { hairColour?: string | null; hairLength?: string | null; eyeColour?: string | null; build?: string | null; heightCm?: number | null };
export type IdealType = {
  rank: 1 | 2 | 3;
  hairColours: string[]; hairLengths: string[]; eyeColours: string[]; builds: string[];
  heightMin?: number | null; heightMax?: number | null; vibes: string[];
};
export type LearnedRow = { dimension: 'hair' | 'length' | 'eyes' | 'build'; value: string; shown: number; liked: number; avgScore?: number | null };

/** Feet and inches for a height in centimetres, e.g. 175 → "5′ 9″". */
export function feetInches(cm: number) {
  const totalIn = Math.round(cm / 2.54);
  return `${Math.floor(totalIn / 12)}′ ${totalIn % 12}″`;
}
export const formatHeight = (cm: number) => `${feetInches(cm)} · ${cm} cm`;

/** How much you liked a value: your average Dial for it when you dialled, else your yes rate. Pulled towards neutral when samples are few. */
const preference = (r: LearnedRow) => r.avgScore != null
  ? (r.avgScore * r.shown + 50 * 2) / (r.shown + 2) / 100
  : (r.liked + 1) / (r.shown + 2);

const RANK_WEIGHT = { 1: 1, 2: 0.9, 3: 0.8 } as const;
const UNKNOWN = 0.5; // someone who has not declared an attribute is neither a match nor a miss

/** How well a look fits one type, 0..1, over only the parts of the type that were filled in. */
export function typeFit(look: Look, t: IdealType): number | null {
  const parts: number[] = [];
  const pick = (wanted: string[], have?: string | null) => { if (wanted.length) parts.push(have ? (wanted.includes(have) ? 1 : 0) : UNKNOWN); };
  pick(t.hairColours, look.hairColour);
  pick(t.hairLengths, look.hairLength);
  pick(t.eyeColours, look.eyeColour);
  pick(t.builds, look.build);
  if (t.heightMin != null || t.heightMax != null) {
    const h = look.heightCm, lo = t.heightMin ?? 0, hi = t.heightMax ?? 999;
    parts.push(h == null ? UNKNOWN : h >= lo && h <= hi ? 1 : Math.min(Math.abs(h - lo), Math.abs(h - hi)) <= 5 ? 0.5 : 0);
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

const describe = (t: IdealType) =>
  [t.hairLengths.join('/'), t.hairColours.join('/') && `${t.hairColours.join(' or ')} hair`, t.eyeColours.length ? `${t.eyeColours.join(' or ')} eyes` : '', t.builds.join('/')]
    .filter(Boolean).join(', ');

/** How well a look fits what someone has learned from training, 0..1. */
export function learnedFit(look: Look, learned: LearnedRow[]): number | null {
  const dims: [LearnedRow['dimension'], string | null | undefined][] = [['hair', look.hairColour], ['length', look.hairLength], ['eyes', look.eyeColour], ['build', look.build]];
  const parts: number[] = [];
  for (const [d, v] of dims) {
    const rows = learned.filter((r) => r.dimension === d && r.shown >= 3);
    if (!rows.length || !v) continue;
    const best = Math.max(...rows.map(preference));
    const mine = rows.find((r) => r.value === v);
    parts.push(mine ? preference(mine) / best : UNKNOWN);
  }
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

/** Plain-language summary of training, e.g. "Dark hair" from the strongest like rates. */
export function learnedSummary(learned: LearnedRow[]): string[] {
  const out: [number, string][] = [];
  for (const d of ['hair', 'eyes', 'build', 'length'] as const) {
    const rows = learned.filter((r) => r.dimension === d && r.shown >= 3);
    if (!rows.length) continue;
    const total = rows.reduce((s, r) => s + r.shown, 0);
    const base = rows.reduce((s, r) => s + preference(r) * r.shown, 0) / total;
    if (!base) continue;
    const top = rows.map((r) => ({ r, lift: preference(r) / base })).sort((a, b) => b.lift - a.lift)[0];
    if (top.lift >= (rows[0].avgScore != null ? 1.12 : 1.25)) out.push([top.lift, d === 'hair' ? `${cap(top.r.value)} hair` : d === 'eyes' ? `${cap(top.r.value)} eyes` : d === 'build' ? cap(top.r.value) : `${cap(top.r.value)} hair`]);
  }
  return out.sort((a, b) => b[0] - a[0]).map(([, s]) => s);
}

/** Turns training into a starting #1 type: the most-liked value in each dimension. */
export function typeFromLearned(learned: LearnedRow[]): IdealType {
  const top = (d: LearnedRow['dimension']) => {
    const rows = learned.filter((r) => r.dimension === d && r.shown >= 3 && (r.avgScore != null ? r.avgScore >= 50 : r.liked > 0))
      .sort((a, b) => preference(b) - preference(a));
    return rows.length ? [rows[0].value] : [];
  };
  return { rank: 1, hairColours: top('hair'), hairLengths: top('length'), eyeColours: top('eyes'), builds: top('build'), vibes: [] };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Looks column: the best of your three types (lower ranks count a little less), blended with training. */
export function looksScore(look: Look, types: IdealType[], learned: LearnedRow[] = []) {
  let best: { fit: number; type: IdealType } | null = null;
  for (const t of types) {
    const f = typeFit(look, t);
    if (f == null) continue;
    const weighted = f * RANK_WEIGHT[t.rank];
    if (!best || weighted > best.fit) best = { fit: weighted, type: t };
  }
  const trained = learnedFit(look, learned);
  if (!best && trained == null) return { percent: null as number | null, rank: null as number | null, reason: null as string | null };
  const value = best && trained != null ? best.fit * 0.7 + trained * 0.3 : best ? best.fit : trained!;
  return {
    percent: Math.round(value * 100),
    rank: best && best.fit >= 0.6 ? best.type.rank : null,
    reason: best && best.fit >= 0.6 ? `Close to your #${best.type.rank}: ${describe(best.type)}` : trained != null && trained >= 0.8 ? 'Fits what you picked in training' : null,
  };
}

/** How well someone's traits fit an ideal, 0..1, over the traits both mention. */
export function traitFit(ideal: Traits, traits: Traits): number | null {
  const keys = (Object.keys(ideal) as (keyof Traits)[]).filter((k) => ideal[k] != null && traits[k] != null);
  if (!keys.length) return null;
  return keys.reduce((s, k) => s + 1 - Math.abs(ideal[k]! - traits[k]!), 0) / keys.length;
}

/**
 * Ideal column. The shared ideal partner carries most of the weight; the vibe of the type
 * their looks fit best adds a little. If they have answered their own ideal partner questions,
 * how well you fit them counts too, so the score is mutual.
 */
export function idealScore(myIdeal: Traits, theirTraits: Traits, fitsTheirIdeal?: number | null, bestTypeVibes: string[] = []) {
  const core = traitFit(myIdeal, theirTraits);
  const vibeTraits = Object.assign({}, ...bestTypeVibes.map((v) => VIBES[v] ?? {}));
  const vibe = bestTypeVibes.length ? traitFit(vibeTraits, theirTraits) : null;
  const mine = core != null && vibe != null ? core * 0.75 + vibe * 0.25 : core ?? vibe;
  if (mine == null) return null;
  const both = fitsTheirIdeal != null ? (mine + fitsTheirIdeal) / 2 : mine;
  return Math.round(both * 100);
}

export const OVERALL_WEIGHTS = { personality: 40, ideal: 35, looks: 25 } as const;

/** Best overall: looks count, but never more than personality and the ideal partner. Missing columns are left out. */
export function overallScore(s: { personality: number | null; ideal: number | null; looks: number | null }) {
  let total = 0, weight = 0;
  for (const k of Object.keys(OVERALL_WEIGHTS) as (keyof typeof OVERALL_WEIGHTS)[]) {
    const v = s[k]; if (v == null) continue;
    total += v * OVERALL_WEIGHTS[k]; weight += OVERALL_WEIGHTS[k];
  }
  return weight ? Math.round(total / weight) : null;
}
