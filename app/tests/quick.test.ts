import { describe, expect, it } from 'vitest';
import { QD, average, cardStats, dialTip, friendly, isHigh, openers, status, until, weighted, type QCardRow } from '../src/quick/core';

const row = (over: Partial<QCardRow>): QCardRow => ({
  id: 'x', firstName: 'Ana', age: 30, look: { hairColour: 'red', eyeColour: 'green', build: 'athletic' }, score: 50, looks: 50, vibe: 50, personality: 50,
  mutual: false, dialledYou: false, scores: [{ kind: 'photo', score: 50 }], ...over,
});

describe('quick dial', () => {
  it('averages Dials and weights looks, vibe and personality 40/20/40 like the server', () => {
    expect(average([80, 90, 85, 75, 90])).toBe(84);
    expect(average([])).toBe(0);
    const s = weighted([...Array(5).fill({ kind: 'photo', score: 60 }), { kind: 'video', score: 80 }, ...Array(5).fill({ kind: 'story', score: 90 })]);
    expect(s).toEqual({ score: 76, looks: 60, vibe: 80, personality: 90 });
    expect(QD.perPerson).toBe(QD.photos + QD.videos + QD.stories);
  });
  it('labels each person on the card', () => {
    expect(status(row({ mutual: true, score: 90 }))).toBe('mutual');
    expect(status(row({ score: QD.threshold }))).toBe('waiting');
    expect(status(row({ score: 85, dialledYou: true }))).toBe('open');   // they dialled you, but not high enough
    expect(status(row({ score: 30 }))).toBe('open');
  });
  it('counts the top of your own range as high, never below 55', () => {
    expect(isHigh(70, [])).toBe(true);
    expect(isHigh(62, [30, 35])).toBe(false);                 // too few Dials to judge a range
    expect(isHigh(62, [30, 35, 40, 62])).toBe(true);          // a selective dialler's best
    expect(isHigh(52, [20, 25, 30, 52])).toBe(false);         // never below the 55 floor
    expect(isHigh(60, [60, 65, 68, 69, 66])).toBe(false);     // a generous dialler's 60 is low for them
  });
  it('builds a scorecard', () => {
    const s = cardStats([
      row({ id: 'a', score: 90, looks: 70, personality: 95, mutual: true }),
      row({ id: 'b', score: 75, looks: 60, personality: 85, look: { hairColour: 'red', eyeColour: 'blue', build: 'curvy' } }),
      row({ id: 'c', score: 20, looks: 30, personality: 20, look: { hairColour: 'blonde' } }),
    ]);
    expect(s.count).toBe(3); expect(s.average).toBe(62); expect(s.style).toBe('Balanced');
    expect(s.highCount).toBe(2); expect(s.mutuals).toBe(1); expect(s.highest?.id).toBe('a');
    expect(s.leansOn).toBe('personality');
    expect(s.drawnTo[0]).toBe('red hair');
    expect(s.drawnTo).not.toContain('blonde hair');
  });
  it('explains limits kindly and counts down to the reset', () => {
    expect(friendly(new Error('daily_limit'))).toMatch(/midnight/);
    expect(friendly(new Error('wait_for_reply'))).toMatch(/One message/);
    expect(until('2026-01-01T03:12:00Z', Date.parse('2026-01-01T00:00:00Z'))).toBe('3h 12m');
  });
  it('writes openers from their best story, or the photo you dialled highest', () => {
    const o = openers({ firstName: 'Ana', scores: [{ kind: 'photo', caption: 'Lisbon', score: 60 }, { kind: 'video', caption: 'Surfing', score: 95 }] });
    expect(o[0]).toContain('"Surfing" video');
    expect(o).toHaveLength(3);
    const o2 = openers({ firstName: 'Ana', scores: [{ kind: 'photo', score: 99 }, { kind: 'story', prompt: 'My hottest take', score: 80 }] });
    expect(o2[0]).toContain('"My hottest take"');
  });
  it('gives a kind, practical tip from your own Dial', () => {
    const base = { raters: 8, score: 70, vibe: 70, weeks: [], bestItem: null, worstItem: null };
    expect(dialTip({ ...base, looks: 60, personality: 80 })).toMatch(/stories/);
    expect(dialTip({ ...base, looks: 80, personality: 60 })).toMatch(/specific/);
    expect(dialTip({ ...base, looks: 70, personality: 70, weeks: [{ week: 'a', score: 60, raters: 3 }, { week: 'b', score: 71, raters: 4 }] })).toMatch(/up 11/);
  });
});
