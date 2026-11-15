// Reply ideas for the demo, where there is no AI service to call. They follow the same brief
// as the real prompt: move the conversation on, in the chosen tone, using what you share.
import type { Tone } from '../../../supabase/functions/_shared/suggest';

type Ctx = { theirName: string; shared: string[]; lastTheirs: string | null; level: number };

export function demoSuggestions(tone: Tone, c: Ctx): string[] {
  const topic = c.shared[0]?.toLowerCase();
  const asked = c.lastTheirs?.includes('?');
  const answer = asked ? 'Honestly? Yes, and I regret nothing. ' : '';
  const lists: Record<Tone, string[]> = {
    playful: topic ? [
      `${answer}Rate my ${topic} credentials out of 100. Be honest, the Dial is watching.`,
      `Important question: what's your most controversial ${topic} opinion?`,
      `I feel like you'd win at ${topic} and then pretend it was luck. Am I right?`,
    ] : [
      `${answer}Be honest: what would you dial my opening line out of 100?`,
      `Important question: what's your most controversial food opinion?`,
      `You strike me as someone with a very specific karaoke song. Which is it?`,
    ],
    curious: topic ? [
      `${answer}What got you into ${topic} in the first place?`,
      `What's the best ${topic} moment you've had this year?`,
      `If you had a free Saturday tomorrow, what would you do with it?`,
    ] : [
      `${answer}What's the best thing that happened to you this week?`,
      `What's something you're weirdly good at?`,
      `If you had a free Saturday tomorrow, what would you do with it?`,
    ],
    deeper: [
      `What's something you care about that people wouldn't guess from your profile?`,
      `What does a really good week look like for you, honestly?`,
      `Who in your life has shaped you the most?`,
    ],
    ask_out: [
      `I'm enjoying this. Fancy carrying it on over a drink this week?`,
      topic ? `We should do ${topic} together. Are you free on Saturday?` : `There's a place I've been meaning to try. Want to come with me on Saturday?`,
      `Coffee somewhere with good light, this weekend? I'll let you pick.`,
    ],
  };
  return lists[tone];
}
