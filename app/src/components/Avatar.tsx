// An illustrated portrait drawn from declared look attributes. Line art on paper:
// no skin tone, no likeness of anyone real, never a generated photo.
import React from 'react';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { formatHeight, type Look } from '../core/looks';
import { colours } from '../theme';

const HAIR: Record<string, string> = { black: '#1E1E24', brunette: '#4A3226', auburn: '#7A3B22', red: '#B4472A', blonde: '#D6B25E', grey: '#A9A9AE', other: '#7E8AA8' };
const EYES: Record<string, string> = { brown: '#5B3A21', hazel: '#8A6A2E', green: '#3F7D4E', blue: '#3F6FB5', grey: '#8C9399' };
const BUILD: Record<string, number> = { slim: 0.78, athletic: 0.96, average: 0.9, curvy: 1.04, plus: 1.14 };

export function Avatar({ look, size, smile, bare }: { look: Look; size: number; smile?: boolean; bare?: boolean }) {
  const hair = HAIR[look.hairColour ?? ''] ?? colours.line;
  const eye = EYES[look.eyeColour ?? ''] ?? colours.slate;
  const f = BUILD[look.build ?? ''] ?? 0.9;
  const ink = colours.text, paper = bare ? 'rgba(255,255,255,0.16)' : colours.surfaceSolid;
  const len = look.hairLength ?? 'medium';
  const torso = `M ${50 - 31 * f} 126 C ${50 - 31 * f} 90, ${50 - 25 * f} 79, 40 77 L 60 77 C ${50 + 25 * f} 79, ${50 + 31 * f} 90, ${50 + 31 * f} 126 Z`;
  return (
    <Svg width={size} height={size * 1.25} viewBox="0 0 100 125" accessibilityLabel={describe(look)}>
      {!bare && <Rect width="100" height="125" fill={colours.surfaceRaised} />}
      {len === 'long' && <Path d="M 31 44 C 29 18, 71 18, 69 44 L 73 96 C 60 101, 40 101, 27 96 Z" fill={hair} />}
      {len === 'medium' && <Path d="M 31 44 C 29 18, 71 18, 69 44 L 70 70 C 60 74, 40 74, 30 70 Z" fill={hair} />}
      <Path d={torso} fill={colours.accentTint} stroke={ink} strokeWidth={1.4} />
      <Rect x="44" y="62" width="12" height="15" fill={paper} stroke={ink} strokeWidth={1.4} />
      <Ellipse cx="50" cy="47" rx="17" ry="21" fill={paper} stroke={ink} strokeWidth={1.4} />
      <Path d={len === 'short' ? 'M 33 44 C 31 24, 69 24, 67 44 C 62 33, 42 31, 33 44 Z' : 'M 32 47 C 29 21, 71 21, 68 47 C 63 33, 44 29, 32 47 Z'} fill={hair} stroke={ink} strokeWidth={1} />
      <Circle cx="43" cy="49" r="2.7" fill={eye} /><Circle cx="57" cy="49" r="2.7" fill={eye} />
      <Circle cx="43" cy="49" r="1.1" fill={ink} /><Circle cx="57" cy="49" r="1.1" fill={ink} />
      <Path d={smile ? 'M 42 57.5 Q 50 66 58 57.5' : 'M 44 58.5 Q 50 62 56 58.5'} stroke={ink} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

export const describe = (l: Look) =>
  [l.hairLength && l.hairColour ? `${l.hairLength} ${l.hairColour} hair` : l.hairColour ? `${l.hairColour} hair` : null,
   l.eyeColour && `${l.eyeColour} eyes`, l.build, l.heightCm && formatHeight(l.heightCm)].filter(Boolean).join(', ');
