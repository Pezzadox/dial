// The Dial mark: a "d" made of two arcs. They set off apart on the left (two people),
// travel round from opposite sides and meet on the right, and the stem of the "d" rises
// from where they join: two paths, one circle, growing together. Colours from every part
// of the Dial gradient meet in the middle.
// `progress` (0..1) draws it: the arcs travel, they meet with a glow, then the stem rises.
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { DIAL_GRADIENT } from '../theme';

const CX = 47, CY = 62, R = 22, W = 7, STEM_TOP = 13;
const at = (deg: number) => { const a = (deg * Math.PI) / 180; return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) }; };
const A0 = at(190), B0 = at(170), JOIN = at(360);
const TOP = `M ${A0.x} ${A0.y} A ${R} ${R} 0 0 1 ${JOIN.x} ${JOIN.y}`;
const BOTTOM = `M ${B0.x} ${B0.y} A ${R} ${R} 0 0 0 ${JOIN.x} ${JOIN.y}`;
const STEM = `M ${JOIN.x} ${CY} L ${JOIN.x} ${STEM_TOP}`;
const ARC_LEN = (R * 170 * Math.PI) / 180, STEM_LEN = CY - STEM_TOP;
const CHAMPAGNE = '#EADBC2';

let seq = 0;
const clamp = (x: number) => Math.max(0, Math.min(1, x));

export function Logo({ size, progress = 1 }: { size: number; progress?: number; letter?: boolean }) {
  const id = React.useMemo(() => `lg${++seq}`, []);
  const arcs = clamp(progress / 0.62), join = clamp((progress - 0.55) / 0.15), stem = clamp((progress - 0.68) / 0.32);
  const dash = (len: number, t: number) => `${len * t} ${len}`;
  const [c1, c2, c3] = DIAL_GRADIENT;
  const line = (d: string, stroke: string, len: number, t: number) => t > 0 && <>
    <Path d={d} stroke={stroke} strokeOpacity={0.22} strokeWidth={W * 2.4} strokeLinecap="round" fill="none" strokeDasharray={dash(len, t)} />
    <Path d={d} stroke={stroke} strokeWidth={W} strokeLinecap="round" fill="none" strokeDasharray={dash(len, t)} />
  </>;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="Dial">
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <LinearGradient id={`${id}t`} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
            <Stop offset="0" stopColor={c1} /><Stop offset="1" stopColor={c2} />
          </LinearGradient>
          <LinearGradient id={`${id}b`} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
            <Stop offset="0" stopColor={c3} /><Stop offset="1" stopColor={c2} />
          </LinearGradient>
          <LinearGradient id={`${id}s`} gradientUnits="userSpaceOnUse" x1="0" y1={CY + 4} x2="0" y2={STEM_TOP}>
            <Stop offset="0" stopColor={c2} /><Stop offset="1" stopColor={CHAMPAGNE} />
          </LinearGradient>
          <RadialGradient id={`${id}j`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} /><Stop offset="1" stopColor={c2} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {line(TOP, `url(#${id}t)`, ARC_LEN, arcs)}
        {line(BOTTOM, `url(#${id}b)`, ARC_LEN, arcs)}
        {line(STEM, `url(#${id}s)`, STEM_LEN, stem)}
        {join > 0 && <Circle cx={JOIN.x} cy={JOIN.y} r={9 + 3 * (1 - join)} fill={`url(#${id}j)`} opacity={join} />}
        <Circle cx={A0.x} cy={A0.y} r={2.6} fill="#FFFFFF" />
        <Circle cx={B0.x} cy={B0.y} r={2.6} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}
