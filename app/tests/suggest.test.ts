import { describe, expect, it } from 'vitest';
import { buildSuggestPrompt, parseSuggestions } from '../../supabase/functions/_shared/suggest';
import { demoSuggestions } from '../src/core/demoSuggest';

describe('AI reply ideas', () => {
  const base = { tone: 'curious' as const, myName: 'Sam', theirName: 'Imogen', sharedInterests: ['Hiking'], theirInterests: ['Hiking', 'Ceramics'], level: 2 };
  it('leaves their messages out unless they opted in, and says so', () => {
    const p = buildSuggestPrompt({ ...base, messages: [{ mine: true, text: 'Where was that photo?' }], theirsIncluded: false });
    expect(p.user).toContain("only Sam's own messages are shared");
    expect(p.system).toContain('JSON array of three strings');
    expect(p.system).toContain('No sexual content');
  });
  it('nudges towards meeting from Level 4', () => {
    expect(buildSuggestPrompt({ ...base, level: 4, messages: [], theirsIncluded: true }).user).toContain('meeting up is a natural next step');
    expect(buildSuggestPrompt({ ...base, level: 0, messages: [], theirsIncluded: true }).user).toContain('Write openers');
  });
  it('reads three ideas from JSON or from a list', () => {
    expect(parseSuggestions('Sure!\n["One?", "Two", "Three", "Four"]')).toEqual(['One?', 'Two', 'Three']);
    expect(parseSuggestions('1. First idea\n2) Second idea\n- Third idea')).toEqual(['First idea', 'Second idea', 'Third idea']);
  });
  it('demo ideas fit the tone and the shared interests', () => {
    const playful = demoSuggestions('playful', { theirName: 'Imogen', shared: ['Wild swimming'], lastTheirs: 'Do you swim in winter too?', level: 1 });
    expect(playful).toHaveLength(3);
    expect(playful.join(' ')).toMatch(/swim/i);
    expect(demoSuggestions('ask_out', { theirName: 'Kit', shared: [], lastTheirs: null, level: 4 }).join(' ')).toMatch(/\?/);
  });
});
