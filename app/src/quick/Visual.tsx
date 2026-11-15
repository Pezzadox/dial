// Quick Dial's visual pieces: people in circles, photos full-bleed, and the big ring Dial.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { Avatar } from '../components/Avatar';
import { ringPath, ringPoint } from '../core/gauge';
import type { Look } from '../core/looks';
import { DIAL_GRADIENT, colours, serif } from '../theme';
import type { QMedia } from './core';

let seq = 0;
const useId = (p: string) => useMemo(() => `${p}${++seq}`, []);
const [C1, C2, C3] = DIAL_GRADIENT;

/** What fills a circle: a real photo, or (in the demo) an illustrated portrait. Booth frames tilt. */
function Frame({ look, photo, size, gid }: { look: Look; photo?: QMedia; size: number; gid: string }) {
  if (photo?.url) return <Image source={{ uri: photo.url }} style={{ width: size, height: size }} />;
  const tilt = photo?.caption === 'tilt-left' ? '-9deg' : photo?.caption === 'tilt-right' ? '9deg' : '0deg';
  return (
    <>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs><LinearGradient id={gid + 'b'} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={photo?.palette?.[0] ?? C2} stopOpacity={0.6} /><Stop offset="1" stopColor={photo?.palette?.[1] ?? C3} stopOpacity={0.6} />
        </LinearGradient></Defs>
        <Rect width={size} height={size} fill={`url(#${gid}b)`} />
      </Svg>
      <View style={{ position: 'absolute', left: size * 0.06, top: size * 0.04, transform: [{ rotate: tilt }] }}><AvatarBare look={look} size={size * 0.88} /></View>
    </>
  );
}

let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotion = v; }).catch(() => {});

/** A person in a circle. Give it frames (their photobooth selfies) and they rotate gently, like a photobooth strip. */
export function PersonCircle({ look, photo, size, score, glow, frames, delay = 0 }:
  { look: Look; photo?: QMedia; size: number; score?: number | null; glow?: boolean; frames?: QMedia[]; delay?: number }) {
  const gid = useId('pc');
  const { d, length } = ringPath(size, 3);
  const s = score ?? 0;
  const list = frames?.length ? frames : photo ? [photo] : [];
  const [at, setAt] = useState(0);
  const fades = useRef(list.map((_, k) => new Animated.Value(k === 0 ? 1 : 0))).current;
  useEffect(() => {
    if (list.length < 2 || reduceMotion) return;
    let timer: ReturnType<typeof setInterval>;
    const start = setTimeout(() => { timer = setInterval(() => setAt((x) => (x + 1) % list.length), 1500); }, delay);
    return () => { clearTimeout(start); clearInterval(timer); };
  }, [list.length, delay]);
  useEffect(() => {
    fades.forEach((f, k) => Animated.timing(f, { toValue: k === at ? 1 : 0, duration: 380, useNativeDriver: Platform.OS !== 'web' }).start());
  }, [at]);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colours.surfaceRaised }}>
        {list.length <= 1
          ? <Frame look={look} photo={list[0]} size={size} gid={gid} />
          : list.map((f, k) => (
              <Animated.View key={f.id} style={[StyleSheet.absoluteFill, { opacity: fades[k] ?? 0 }]}>
                <Frame look={look} photo={f} size={size} gid={gid + k} />
              </Animated.View>
            ))}
      </View>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={C1} /><Stop offset="0.5" stopColor={C2} /><Stop offset="1" stopColor={C3} />
        </LinearGradient></Defs>
        <Path d={d} stroke={glow ? `url(#${gid})` : 'rgba(255,255,255,0.22)'} strokeWidth={glow ? 2.5 : 1.2} fill="none" />
        {s > 0 && <Path d={d} stroke={s >= 100 ? colours.foil : `url(#${gid})`} strokeWidth={4} strokeLinecap="round" fill="none" strokeDasharray={`${(length * s) / 100} ${length}`} />}
      </Svg>
    </View>
  );
}

/** The illustrated portrait without its background, so the circle's colour shows through. */
function AvatarBare({ look, size }: { look: Look; size: number }) {
  return <View style={{ width: size, height: size * 1.25, opacity: 0.98 }}><Avatar look={look} size={size} smile bare /></View>;
}

/** One photo or video, filling the screen. */
export function MediaFull({ media, look, width, height }: { media: QMedia; look: Look; width: number; height: number }) {
  const gid = useId('mf');
  const [a, b] = media.palette ?? [C2, C3];
  if (media.kind === 'story') return (
    <View style={{ width, height, backgroundColor: '#0E0C1A' }}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs><RadialGradient id={gid} cx="30%" cy="20%" r="90%"><Stop offset="0" stopColor={a} stopOpacity={0.55} /><Stop offset="1" stopColor="#0E0C1A" stopOpacity={1} /></RadialGradient></Defs>
        <Rect width={width} height={height} fill={`url(#${gid})`} />
      </Svg>
      {/* The story sits above the Dial, so both are readable. */}
      <View style={[styles.story, { top: 124, width: width - 48 }]}>
        <Text style={styles.storyPrompt}>{media.prompt}</Text>
        <Text style={[styles.storyAnswer, storySize(media.answer ?? '', width, height)]} adjustsFontSizeToFit numberOfLines={4}>“{media.answer}”</Text>
      </View>
    </View>
  );
  const av = Math.min(width * 0.8, (height * 0.44) / 1.25);
  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      {media.url && media.kind === 'photo'
        ? <Image source={{ uri: media.url }} style={{ width, height }} resizeMode="cover" />
        : <>
            <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
              <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
              <Rect width={width} height={height} fill={`url(#${gid})`} />
            </Svg>
            <View style={{ position: 'absolute', bottom: 0, left: (width - av) / 2, opacity: 0.7 }}><Avatar look={look} size={av} smile bare /></View>
          </>}
      <View style={styles.tag} pointerEvents="none">
        {media.kind === 'video' && <Feather name="play" size={11} color="#fff" />}
        <Text style={styles.tagText}>{media.kind === 'video' ? 'Talking video' : 'Photo'}{media.caption ? `  ·  ${media.caption}` : ''}</Text>
      </View>
    </View>
  );
}

/** Story text sized to fit the space above the Dial (which sits at 56% of the height). */
function storySize(answer: string, width: number, height: number) {
  const room = height * 0.56 - Math.min(width * 0.62, height * 0.4) / 2 - 124 - 30;   // px between prompt and Dial
  const charsPerLine = (size: number) => Math.max(10, Math.floor((width - 48) / (size * 0.48)));
  for (const size of [26, 23, 20, 18, 16]) {
    const lines = Math.ceil((answer.length + 2) / charsPerLine(size));
    if (lines * size * 1.25 <= room) return { fontSize: size, lineHeight: Math.round(size * 1.25) };
  }
  return { fontSize: 15, lineHeight: 19 };
}

/** The big ring Dial, 1-100, with a glow that grows as it climbs. */
export function Ring({ value, size, word }: { value: number; size: number; word: string }) {
  const gid = useId('rg');
  const STROKE = 10, inset = STROKE / 2 + 10;
  const { d, length } = ringPath(size, inset);
  const tip = ringPoint(size, inset, (length * value) / 100);
  const dash = `${(length * value) / 100} ${length}`;
  const full = Math.round(value) >= 100;
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={C1} /><Stop offset="0.5" stopColor={C2} /><Stop offset="1" stopColor={C3} /></LinearGradient>
          <RadialGradient id={gid + 'g'} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={full ? colours.foil : C2} stopOpacity={0.55} /><Stop offset="1" stopColor={full ? colours.foil : C3} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size * (0.3 + 0.2 * value / 100)} fill={`url(#${gid}g)`} />
        <Path d={d} stroke="rgba(255,255,255,0.22)" strokeWidth={STROKE} fill="none" />
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => {
          const p = ringPoint(size, inset, (length * n) / 100);
          return <Circle key={n} cx={p.x} cy={p.y} r={n === 70 ? 4.5 : 2.6} fill={n === 70 ? colours.foil : value >= n ? '#FFFFFF' : 'rgba(255,255,255,0.4)'} />;
        })}
        <Path d={d} stroke={`url(#${gid})`} strokeOpacity={0.2} strokeWidth={STROKE + 22} strokeLinecap="round" fill="none" strokeDasharray={dash} />
        <Path d={d} stroke={full ? colours.foil : `url(#${gid})`} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={dash} />
        <Circle cx={tip.x} cy={tip.y} r={18} fill={full ? colours.foil : C2} fillOpacity={0.35} />
        <Circle cx={tip.x} cy={tip.y} r={8} fill="#FFFFFF" />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.big, { fontSize: size * 0.36 }]}>{Math.round(value)}</Text>
        <Text style={styles.word}>{word}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: { position: 'absolute', top: 128, left: 20, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.4 },
  story: { position: 'absolute', left: 24 },
  storyPrompt: { color: '#EADBC2', fontSize: 11, fontWeight: '700', letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 10 },
  storyAnswer: { color: '#FFFFFF', fontFamily: serif, lineHeight: 32 },
  big: { color: '#FFFFFF', fontFamily: serif, fontVariant: ['lining-nums', 'tabular-nums'], textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 12 },
  word: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginTop: -8 },
});
