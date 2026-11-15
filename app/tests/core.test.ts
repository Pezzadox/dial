import { describe, expect, it } from 'vitest';
import { chapterFor, chapterProgress, conversationLevel, CHAPTERS } from '../src/core/economy';
import { angleDelta, applyRotation, angleAt, framePath } from '../src/core/gauge';
import { compatibility, COMPAT_WEIGHTS } from '../src/core/compatibility';
import { standing, smoothed, STANDING_WEIGHTS } from '../src/core/standing';

describe('chapters', () => {
  it('uses the documented thresholds', () => {
    expect(chapterFor(0).name).toBe('Opening Line');
    expect(chapterFor(499).number).toBe(1);
    expect(chapterFor(500).name).toBe('Good Company');
    expect(chapterFor(6999).number).toBe(4);
    expect(chapterFor(20000).name).toBe('Icon');
    expect(CHAPTERS.map((c) => c.ink)).toEqual([0, 500, 1500, 3500, 7000, 12000, 20000]);
  });
  it('reports progress to the next chapter', () => {
    const p = chapterProgress(1000);
    expect(p.current.number).toBe(2);
    expect(p.inkToNext).toBe(500);
    expect(p.fraction).toBe(0.5);
    expect(chapterProgress(25000).next).toBeNull();
  });
});

describe('conversation levels', () => {
  const base = { messagesA: 0, messagesB: 0, questionsA: 0, questionsB: 0, voiceA: 0, voiceB: 0, activeDays: 1, meetIntents: 0 };
  it('needs both people at every step', () => {
    expect(conversationLevel({ ...base, messagesA: 40 })).toBe(0);
    expect(conversationLevel({ ...base, messagesA: 1, messagesB: 1 })).toBe(1);
    expect(conversationLevel({ ...base, messagesA: 10, messagesB: 10, activeDays: 2 })).toBe(2);
    expect(conversationLevel({ ...base, messagesA: 40, messagesB: 10, activeDays: 3, questionsA: 1, questionsB: 1 })).toBe(2); // 80% one-sided
    expect(conversationLevel({ ...base, messagesA: 12, messagesB: 10, activeDays: 3, questionsA: 1, questionsB: 1 })).toBe(3);
    expect(conversationLevel({ ...base, messagesA: 12, messagesB: 10, activeDays: 3, questionsA: 1, questionsB: 1, voiceA: 1 })).toBe(3);
    expect(conversationLevel({ ...base, messagesA: 12, messagesB: 10, activeDays: 3, questionsA: 1, questionsB: 1, voiceA: 1, voiceB: 1, meetIntents: 2 })).toBe(5);
  });
  it('never goes down', () => {
    expect(conversationLevel(base, 3)).toBe(3);
  });
});

describe('power gauge', () => {
  it('handles the wrap at 180 degrees', () => {
    expect(angleDelta(170, -170)).toBe(20);
    expect(angleDelta(-170, 170)).toBe(-20);
    expect(angleDelta(10, 40)).toBe(30);
  });
  it('half a turn clockwise fills the gauge, and it clamps', () => {
    let s = 0;
    for (let a = 0; a < 180; a += 10) s = applyRotation(s, a, a + 10);
    expect(Math.round(s)).toBe(100);
    expect(applyRotation(95, 0, 90)).toBe(100);
    expect(applyRotation(5, 90, 0)).toBe(0);
    expect(applyRotation(50, 0, 18)).toBeCloseTo(60);
  });
  it('ignores touches too close to the centre', () => {
    expect(angleAt(101, 101, 100, 100)).toBeNull();
    expect(angleAt(200, 100, 100, 100)).toBe(0);
    expect(angleAt(100, 200, 100, 100)).toBe(90);
  });
  it('measures the frame outline', () => {
    const { length } = framePath(100, 100, 0, 0);
    expect(length).toBe(400);
    expect(framePath(100, 100, 50, 0).length).toBeCloseTo(Math.PI * 100);
  });
});

describe('compatibility', () => {
  it('weights total 100', () => {
    expect(Object.values(COMPAT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('scores an aligned pair above a misaligned one and explains why', () => {
    const me = { intentions: 'something serious', interests: ['Hiking', 'Film', 'Cooking'], traits: { humour: 0.8, openness: 0.7, talkative: 0.8, planner: 0.8, socialEnergy: 0.6, activity: 0.7, replyPace: 0.5 } };
    const good = { intentions: 'something serious', interests: ['hiking', 'film', 'Jazz'], traits: { humour: 0.85, openness: 0.7, talkative: 0.3, planner: 0.3, socialEnergy: 0.6, activity: 0.7, replyPace: 0.5 } };
    const poor = { intentions: 'something casual', interests: ['Gaming'], traits: { humour: 0.1, openness: 0.1, talkative: 0.8, planner: 0.8, socialEnergy: 0.1, activity: 0.1, replyPace: 1 } };
    const a = compatibility(me, good), b = compatibility(me, poor);
    expect(a.percent).toBeGreaterThan(80);
    expect(b.percent).toBeLessThan(45);
    expect(a.reasons).toContain('You both want something serious');
    expect(a.reasons.length).toBeLessThanOrEqual(3);
    expect(a.shared).toEqual(['hiking', 'film']);
    expect(a.percent).toBeLessThanOrEqual(100);
  });
  it('stays neutral when nothing is known', () => {
    expect(compatibility({ interests: [], traits: {} }, { interests: [], traits: {} }).percent).toBe(43);
  });
});

describe('standing', () => {
  it('weights total 100 and ignore popularity', () => {
    expect(Object.values(STANDING_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    expect('matches' in STANDING_WEIGHTS).toBe(false);
  });
  it('is neutral with no evidence and bounded', () => {
    expect(standing({})).toBe(50);
    expect(standing({ communication: 100, connection: 100, dateExperience: 100, effort: 100, character: 100, presentation: 100, community: 100, consistency: 100 })).toBe(100);
    expect(standing({ presentation: 100 })).toBe(55);
  });
  it('smooths small samples towards neutral', () => {
    expect(smoothed(100, 1)).toBeCloseTo(58.33, 1);
    expect(smoothed(100, 95)).toBeCloseTo(97.5);
  });
});

import { PERSONALITY, scoreAnswers, highlights } from '../src/core/assessment';
describe('personality game', () => {
  it('averages traits that several questions touch', () => {
    const t = scoreAnswers(PERSONALITY, { party: 0, recharge: 2, saturday: 0 });
    expect(t.socialEnergy).toBe(0.5);         // (0.85 + 0.15) / 2
    expect(t.planner).toBe(0.9);
    expect(t.humour).toBeUndefined();
  });
  it('produces only values the server accepts', () => {
    const all = Object.fromEntries(PERSONALITY.map((q) => [q.id, q.options.length - 1]));
    const allowed = ['humour', 'openness', 'talkative', 'planner', 'socialEnergy', 'activity', 'replyPace', 'curiosity', 'creativity'];
    for (const [k, v] of Object.entries(scoreAnswers(PERSONALITY, all))) { expect(allowed).toContain(k); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
  });
  it('names the strongest traits', () => {
    expect(highlights({ planner: 0.9, talkative: 0.2, humour: 0.5 })).toEqual(['Planner', 'Listener']);
  });
});

import { typeFit, looksScore, learnedFit, learnedSummary, typeFromLearned, traitFit, idealScore, overallScore, OVERALL_WEIGHTS, type IdealType, type LearnedRow } from '../src/core/looks';
import { IDEAL_PARTNER } from '../src/core/assessment';
describe('looks and the ideal partner', () => {
  const t1: IdealType = { rank: 1, hairColours: ['brunette', 'black'], hairLengths: [], eyeColours: ['blue'], builds: ['curvy'], vibes: ['warm'] };
  const t2: IdealType = { rank: 2, hairColours: ['red'], hairLengths: [], eyeColours: ['green'], builds: ['athletic'], vibes: ['sporty'] };
  const t3: IdealType = { rank: 3, hairColours: ['blonde'], hairLengths: [], eyeColours: [], builds: [], heightMin: 120, heightMax: 164, vibes: ['bubbly', 'playful'] };
  it('scores a type only on what was filled in, with undeclared attributes neutral', () => {
    expect(typeFit({ hairColour: 'black', eyeColour: 'blue', build: 'curvy' }, t1)).toBe(1);
    expect(typeFit({ hairColour: 'black', eyeColour: 'brown', build: 'curvy' }, t1)).toBeCloseTo(2 / 3);
    expect(typeFit({ hairColour: 'black' }, t1)).toBeCloseTo((1 + 0.5 + 0.5) / 3);
    expect(typeFit({ hairColour: 'blonde', heightCm: 168 }, t3)).toBe(0.75);   // 4 cm over: half credit
    expect(typeFit({}, { rank: 1, hairColours: [], hairLengths: [], eyeColours: [], builds: [], vibes: [] })).toBeNull();
  });
  it('takes the best of the three types, ranking #1 a little higher', () => {
    const red = looksScore({ hairColour: 'red', eyeColour: 'green', build: 'athletic' }, [t1, t2, t3]);
    expect(red.rank).toBe(2); expect(red.percent).toBe(90);
    expect(red.reason).toBe('Close to your #2: red hair, green eyes, athletic');
    expect(looksScore({ hairColour: 'black', eyeColour: 'blue', build: 'curvy' }, [t1, t2, t3]).percent).toBe(100);
    expect(looksScore({ hairColour: 'grey' }, []).percent).toBeNull();
  });
  it('learns a type from training answers', () => {
    const learned: LearnedRow[] = [
      { dimension: 'hair', value: 'brunette', shown: 20, liked: 14 }, { dimension: 'hair', value: 'blonde', shown: 20, liked: 4 },
      { dimension: 'eyes', value: 'blue', shown: 10, liked: 7 }, { dimension: 'eyes', value: 'brown', shown: 30, liked: 11 },
    ];
    expect(learnedFit({ hairColour: 'brunette', eyeColour: 'blue' }, learned)).toBe(1);
    expect(learnedFit({ hairColour: 'blonde' }, learned)!).toBeLessThan(0.4);
    expect(learnedSummary(learned).sort()).toEqual(['Blue eyes', 'Brunette hair']);
    expect(typeFromLearned(learned)).toMatchObject({ hairColours: ['brunette'], eyeColours: ['blue'] });
  });
  it('makes the ideal column mutual and lets the vibe nudge it', () => {
    const myIdeal = { planner: 0.9, humour: 0.8 };
    expect(traitFit(myIdeal, { planner: 0.9, humour: 0.7 })).toBeCloseTo(0.95);
    expect(idealScore(myIdeal, { planner: 0.9, humour: 0.7 })).toBe(95);
    expect(idealScore(myIdeal, { planner: 0.9, humour: 0.7 }, 0.55)).toBe(75);
    expect(idealScore({}, { activity: 0.9 }, null, ['sporty'])).toBe(100);
    expect(idealScore({}, {}, null)).toBeNull();
  });
  it('never lets looks outweigh personality or the ideal partner', () => {
    expect(OVERALL_WEIGHTS.looks).toBeLessThan(OVERALL_WEIGHTS.personality);
    expect(OVERALL_WEIGHTS.looks).toBeLessThan(OVERALL_WEIGHTS.ideal);
    expect(overallScore({ personality: 80, ideal: 60, looks: null })).toBe(71);
    expect(overallScore({ personality: null, ideal: null, looks: null })).toBeNull();
  });
  it('asks the ideal partner questions about the same traits as your own', () => {
    expect(IDEAL_PARTNER.map((q) => q.id)).toEqual(['saturday', 'party', 'laugh', 'trip', 'weeknight', 'replies', 'recharge', 'rabbit']);
  });
});

import { framePoint, precisionFactor, dialWord, applyRotation as rot } from '../src/core/gauge';
describe('the Dial', () => {
  it('walks the frame from top centre, clockwise', () => {
    const { length } = framePath(200, 300, 20, 5);
    const at = (t: number) => framePoint(200, 300, 20, 5, length * t);
    expect(at(0)).toEqual({ x: 100, y: 5 });
    expect(at(0.5).x).toBeCloseTo(100); expect(at(0.5).y).toBeCloseTo(295);
    expect(at(0.25).x).toBeCloseTo(195);                       // right side a quarter of the way round
    expect(at(1).x).toBeCloseTo(100); expect(at(1).y).toBeCloseTo(5);
  });
  it('turns more finely near the centre', () => {
    expect(precisionFactor(100, 0, 0, 0, 100)).toBe(1);
    expect(precisionFactor(10, 0, 0, 0, 100)).toBe(0.35);
    expect(rot(50, 0, 18, 0.5)).toBeCloseTo(55);
  });
  it('names the milestones', () => {
    expect([0, 30, 50, 70, 90, 100].map(dialWord)).toEqual(['Not for me', 'Maybe', 'Good', 'Great', 'Wow', 'Full Dial']);
  });
});

import { feetInches, formatHeight } from '../src/core/looks';
describe('dialling your type and heights', () => {
  it('learns from Dial scores, not just yes or no', () => {
    const learned: LearnedRow[] = [
      { dimension: 'hair', value: 'red', shown: 10, liked: 8, avgScore: 84 },
      { dimension: 'hair', value: 'blonde', shown: 10, liked: 2, avgScore: 31 },
      { dimension: 'eyes', value: 'green', shown: 6, liked: 3, avgScore: 55 },
      { dimension: 'eyes', value: 'brown', shown: 6, liked: 3, avgScore: 54 },
    ];
    expect(learnedFit({ hairColour: 'red' }, learned)).toBe(1);
    expect(learnedFit({ hairColour: 'blonde' }, learned)!).toBeLessThan(0.45);
    expect(learnedSummary(learned)).toEqual(['Red hair']);               // eyes too close to call
    expect(typeFromLearned(learned).hairColours).toEqual(['red']);
  });
  it('shows heights in feet and centimetres', () => {
    expect(feetInches(175)).toBe('5′ 9″');
    expect(feetInches(183)).toBe('6′ 0″');
    expect(formatHeight(160)).toBe('5′ 3″ · 160 cm');
  });
  it('keeps the Dial between 1 and 100 when asked', () => {
    expect(rot(5, 90, 0, 1, 1)).toBe(1);
  });
});

import { ringPath, ringPoint } from '../src/core/gauge';
describe('the round Dial', () => {
  it('starts at the top and runs clockwise', () => {
    const { length } = ringPath(200, 10);
    expect(length).toBeCloseTo(2 * Math.PI * 90);
    expect(ringPoint(200, 10, 0)).toEqual({ x: 100, y: 10 });
    const q = ringPoint(200, 10, length / 4); expect(q.x).toBeCloseTo(190); expect(q.y).toBeCloseTo(100);
  });
});

import { GAMES, gameResult, nextRound } from '../src/core/games';
describe('games for two', () => {
  it('counts a finished game towards Level 4', () => {
    const s = { messagesA: 12, messagesB: 10, questionsA: 1, questionsB: 1, voiceA: 0, voiceB: 0, activeDays: 3, meetIntents: 0 };
    expect(conversationLevel(s)).toBe(3);
    expect(conversationLevel({ ...s, gamesCompleted: 1 })).toBe(4);
  });
  it('plays rounds in order and builds a date from both picks', () => {
    const r = GAMES.build_a_date.rounds;
    expect(nextRound(r, { 0: 1 })).toBe(1);
    expect(nextRound(r, { 0: 1, 1: 0, 2: 0, 3: 0 })).toBeNull();
    const res = gameResult('build_a_date', r, { 0: 0, 1: 0, 2: 1, 3: 2 }, { 0: 0, 1: 1, 2: 1, 3: 2 }, 'Kit');
    expect(res.lines).toEqual(['Where: Rooftop bar', 'When: Golden hour or Lazy Sunday brunch', 'Vibe: Trainers on', 'First round: Whoever loses a game']);
    expect(res.venue).toBe('Rooftop bar');
    expect(res.headline).toBe('You agreed on 3 of 4');
  });
  it('scores this or that', () => {
    const r = GAMES.this_or_that.rounds;
    expect(gameResult('this_or_that', r, { 0: 0, 1: 1 }, { 0: 0, 1: 0 }, 'Kit').headline).toBe('You clicked on 1 of 2');
  });
});

import { ageOn, dobMaskRest, dobToIso, formatDob } from '../src/core/dob';
describe('date of birth', () => {
  it('puts the slashes in as you type digits', () => {
    expect(formatDob('1')).toBe('1');
    expect(formatDob('14')).toBe('14');
    expect(formatDob('140')).toBe('14/0');
    expect(formatDob('1402')).toBe('14/02');
    expect(formatDob('14021995')).toBe('14/02/1995');
    expect(formatDob('14/02/19955')).toBe('14/02/1995');   // extra digits ignored
    expect(formatDob('14/0')).toBe('14/0');                // deleting past a slash works
    expect(dobMaskRest('14/0')).toBe('M/YYYY');
  });
  it('accepts only real dates', () => {
    expect(dobToIso('14/02/1995')).toBe('1995-02-14');
    expect(dobToIso('31/02/1995')).toBeNull();
    expect(dobToIso('14/02/19')).toBeNull();
    expect(ageOn('2000-11-16', new Date(2018, 10, 15))).toBe(17);
    expect(ageOn('2000-11-15', new Date(2018, 10, 15))).toBe(18);
  });
});
