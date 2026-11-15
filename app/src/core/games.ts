// Games for two inside a chat. Each round, both people pick privately; the round is revealed
// once both have picked. The result is something you made together, not small talk.

export type GameKind = 'build_a_date' | 'this_or_that';
export type Round = { prompt: string; options: string[] };

export const GAMES: Record<GameKind, { title: string; blurb: string; rounds: Round[] }> = {
  build_a_date: {
    title: 'Build a date',
    blurb: 'Four quick rounds. You both pick; the result is a first date you designed together.',
    rounds: [
      { prompt: 'Where are we going?', options: ['Rooftop bar', 'Market food hall', 'Gallery late', 'Coastal walk', 'Tiny jazz club', 'Cooking class'] },
      { prompt: 'When?', options: ['Golden hour', 'Lazy Sunday brunch', 'Late night', 'Tonight, why not'] },
      { prompt: 'The vibe?', options: ['Dress up', 'Trainers on', 'Something competitive', 'Slow and chatty'] },
      { prompt: "First round's on…", options: ['Me', 'You', 'Whoever loses a game', 'We split it'] },
    ],
  },
  this_or_that: {
    title: 'This or that',
    blurb: 'Six quick-fire choices. See where you click and where you clash.',
    rounds: [
      { prompt: 'Holiday', options: ['Mountains', 'Beach'] },
      { prompt: 'Friday night', options: ['Night in', 'Night out'] },
      { prompt: 'Plans', options: ['Plan it all', 'Wing it'] },
      { prompt: 'Best part of the day', options: ['Sunrise', 'Sunset'] },
      { prompt: 'Keeping in touch', options: ['Text', 'Call'] },
      { prompt: 'Pets', options: ['Dogs', 'Cats'] },
    ],
  },
};

export type Picks = Record<number, number>;

/** The round I should play next, or null when I have picked in every round. */
export const nextRound = (rounds: Round[], mine: Picks) => { for (let i = 0; i < rounds.length; i++) if (mine[i] == null) return i; return null; };

/** What you built together, from the rounds both of you have picked. */
export function gameResult(kind: GameKind, rounds: Round[], mine: Picks, theirs: Picks, theirName: string) {
  const both = rounds.map((r, i) => ({ r, a: mine[i], b: theirs[i] })).filter((x) => x.a != null && x.b != null);
  const agree = both.filter((x) => x.a === x.b).length;
  if (kind === 'this_or_that') {
    return { headline: `You clicked on ${agree} of ${both.length}`, lines: both.map((x) => x.a === x.b ? `${x.r.options[x.a!]} · both of you` : `You: ${x.r.options[x.a!]} · ${theirName}: ${x.r.options[x.b!]}`), venue: null as string | null };
  }
  const pick = (i: number) => { const x = both[i]; if (!x) return null; return x.a === x.b ? x.r.options[x.a!] : `${x.r.options[x.a!]} or ${x.r.options[x.b!]}`; };
  const where = pick(0), when = pick(1), vibe = pick(2), tab = pick(3);
  return {
    headline: agree === both.length ? 'Total agreement. Suspicious, but lovely.' : `You agreed on ${agree} of ${both.length}`,
    lines: [where && `Where: ${where}`, when && `When: ${when}`, vibe && `Vibe: ${vibe}`, tab && `First round: ${tab}`].filter(Boolean) as string[],
    venue: both[0] ? both[0].r.options[both[0].a!] : null,
  };
}
