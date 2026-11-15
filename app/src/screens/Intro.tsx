// Every launch: the logo draws itself, then the wordmark and slogan rise in. Tap to skip.
// First launch: a short walkthrough that ends with a practice Dial.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { Media } from '../api';
import { DialCircle } from '../components/DialCircle';
import { Logo } from '../components/Logo';
import { Button, Muted } from '../components/ui';
import { ringPath, ringPoint, dialWord } from '../core/gauge';
import { play } from '../sound';
import { DIAL_GRADIENT, colours, serif, themed } from '../theme';

const nativeDriver = Platform.OS !== 'web';

/** Runs `fn(t)` with t going 0 → 1 over `ms`, eased, on every frame. */
export function useTween(ms: number, run: boolean, loop = false) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!run) return;
    let raf = 0; const start = Date.now();
    const step = () => {
      let x = (Date.now() - start) / ms;
      if (loop) x = x % 1.6;                       // a pause at the end of each loop
      const c = Math.min(1, x);
      setT(1 - Math.pow(1 - c, 3));
      if (loop || x < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ms, run, loop]);
  return t;
}

export function Splash({ onDone }: { onDone: () => void }) {
  const ring = useTween(1500, true);
  const rise = useRef(new Animated.Value(0)).current;
  const out = useRef(new Animated.Value(1)).current;
  const done = useRef(false);
  const finish = () => {
    if (done.current) return; done.current = true;
    Animated.timing(out, { toValue: 0, duration: 380, useNativeDriver: nativeDriver }).start(onDone);
  };
  useEffect(() => {
    play('intro', 0.8);
    Animated.timing(rise, { toValue: 1, duration: 700, delay: 750, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
    const timer = setTimeout(finish, 2800);
    return () => clearTimeout(timer);
  }, []);
  return (
    <Pressable style={styles.splash} onPress={finish} accessibilityRole="button" accessibilityLabel="Skip intro">
      <Animated.View style={{ opacity: out, alignItems: 'center' }}>
        <Logo size={170} progress={ring} />
        <Animated.View style={{ alignItems: 'center', opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
          <Text style={styles.wordmark}>dial</Text>
          <Text style={styles.slogan}>The match is only the beginning</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// First-time walkthrough
// ---------------------------------------------------------------------------
const PRACTICE: Media = { id: 'practice', kind: 'photo', caption: 'Practice photo', palette: ['#3B1E54', '#C2409B'], myScore: null };

export function Walkthrough({ onDone }: { onDone: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width, 480) - 48;
  const [page, setPage] = useState(0);
  const [practice, setPractice] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const go = (to: number) => {
    if (to < 0 || to >= PAGES) return;
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: nativeDriver }).start(() => {
      setPage(to);
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: nativeDriver }).start();
    });
  };
  const pageRef = useRef(page); pageRef.current = page;
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_e, g) => { if (g.dx < -50) go(pageRef.current + 1); else if (g.dx > 50) go(pageRef.current - 1); },
  })).current;

  const pages: { eyebrow: string; title: string; body: string; art: React.ReactNode }[] = [
    { eyebrow: 'Welcome', title: 'Dating, dialled in.',
      body: "No swiping. On Dial you turn a dial from 1 to 100 for the people you meet, and it's what you do with a match that counts.",
      art: <Logo size={Math.min(170, w * 0.5)} /> },
    { eyebrow: 'Step 1', title: 'Dial their photos',
      body: 'Hold or tap any photo. It opens full screen with a ring in the middle: turn around it to go up or down. Let go to set it. Only the owner sees an average, never who.',
      art: <DemoDial size={Math.min(200, w * 0.6)} target={78} /> },
    { eyebrow: 'Step 2', title: 'Dial the person',
      body: "At the end of every profile there's one round Dial for them. 70 or more, and they dial you 70 or more too: it's a match. Anything lower stays private.",
      art: <MatchArt size={Math.min(130, w * 0.36)} /> },
    { eyebrow: 'Step 3', title: 'Talk, meet, rise',
      body: 'Good conversations level up. Meet in person and you both confirm it. Every real step earns Ink, which moves you up Chapters. Ink can never be bought.',
      art: <InkArt size={Math.min(170, w * 0.5)} /> },
    { eyebrow: 'Your turn', title: practice == null ? 'Try your first Dial' : `Nice. You dialled ${practice}.`,
      body: practice == null ? 'Hold the circle and turn, or tap it and drag around the ring. Go on, nothing counts yet.'
        : practice >= 70 ? "That's 70 or more, so on a person's round Dial it would say you're interested." : 'On a real profile that stays private. Nobody is told.',
      art: <DialCircle media={{ ...PRACTICE, myScore: practice }} size={Math.min(190, w * 0.56)} score={practice} onRate={(v) => { setPractice(v); }} /> },
  ];
  const p = pages[page];
  const last = page === PAGES - 1;

  return (
    <View style={styles.walk} {...swipe.panHandlers}>
      <View style={styles.top}>
        <Logo size={34} letter={false} progress={(page + 1) / PAGES} />
        <Pressable onPress={onDone} accessibilityRole="button" hitSlop={12}><Text style={styles.skip}>Skip</Text></Pressable>
      </View>
      <Animated.View style={[styles.body, { opacity: fade }]}>
        <View style={styles.art}>{p.art}</View>
        <Text style={styles.eyebrow}>{p.eyebrow}</Text>
        <Text style={styles.title}>{p.title}</Text>
        <Muted style={styles.text}>{p.body}</Muted>
      </Animated.View>
      <View style={styles.dots}>
        {pages.map((_, i) => <Pressable key={i} onPress={() => go(i)} accessibilityLabel={`Page ${i + 1}`} hitSlop={6}>
          <View style={[styles.dot, i === page && styles.dotOn]} />
        </Pressable>)}
      </View>
      <View style={styles.actions}>
        {page > 0 && <Button kind="quiet" label="Back" onPress={() => go(page - 1)} style={{ flex: 1 }} />}
        <Button label={last ? (practice == null ? 'Skip practice' : 'Start dialling') : 'Next'} onPress={() => (last ? onDone() : go(page + 1))} style={{ flex: 2 }} />
      </View>
    </View>
  );
}
const PAGES = 5;

/** A ring that winds itself to `target`, a fingertip travelling round it, on a loop. */
function DemoDial({ size, target }: { size: number; target: number }) {
  const t = useTween(1800, true, true);
  const v = Math.max(1, Math.round(target * t));
  const inset = 10;
  const { d, length } = ringPath(size, inset);
  const tip = ringPoint(size, inset, (length * v) / 100);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size - 34, height: size - 34, borderRadius: size, overflow: 'hidden' }}>
        <Svg width={size} height={size}><Defs><LinearGradient id="demoPhoto" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2A1B3D" /><Stop offset="1" stopColor="#8C5BD6" /></LinearGradient></Defs>
          <Circle cx={size / 2} cy={size / 2} r={size} fill="url(#demoPhoto)" /></Svg>
      </View>
      <GradientRing size={size} d={d} length={length} value={v} />
      <View style={[styles.finger, { left: tip.x - 15, top: tip.y - 15 }]} />
      <Text style={styles.demoNum}>{v}</Text>
      <Text style={styles.demoWord}>{dialWord(v)}</Text>
    </View>
  );
}

function GradientRing({ size, d, length, value, id = 'gr' }: { size: number; d: string; length: number; value: number; id?: string }) {
  const dash = `${(length * value) / 100} ${length}`;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs><LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor={DIAL_GRADIENT[0]} /><Stop offset="0.5" stopColor={DIAL_GRADIENT[1]} /><Stop offset="1" stopColor={DIAL_GRADIENT[2]} />
      </LinearGradient></Defs>
      <Path d={d} stroke="rgba(255,255,255,0.18)" strokeWidth={6} fill="none" />
      <Path d={d} stroke={`url(#${id})`} strokeOpacity={0.3} strokeWidth={16} strokeLinecap="round" fill="none" strokeDasharray={dash} />
      <Path d={d} stroke={`url(#${id})`} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray={dash} />
    </Svg>
  );
}

/** Two rings fill past the gold mark, then "It's a match". */
function MatchArt({ size }: { size: number }) {
  const t = useTween(1600, true, true);
  const inset = 8;
  const { d, length } = ringPath(size, inset);
  const mark = ringPoint(size, inset, length * 0.7);
  const ring = (target: number, label: string, id: string) => {
    const v = Math.max(1, Math.round(target * t));
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <GradientRing size={size} d={d} length={length} value={v} id={id} />
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}><Circle cx={mark.x} cy={mark.y} r={4} fill={colours.foil} /></Svg>
          <Text style={[styles.demoNum, { fontSize: size * 0.32 }]}>{v}</Text>
        </View>
        <Text style={styles.ringLabel}>{label}</Text>
      </View>
    );
  };
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', gap: 18 }}>{ring(84, 'You', 'mA')}{ring(77, 'Them', 'mB')}</View>
      <Text style={[styles.matchText, { opacity: t > 0.95 ? 1 : 0 }]}>It's a match</Text>
    </View>
  );
}

/** The Ink ring filling, with the Chapter beneath it. */
function InkArt({ size }: { size: number }) {
  const t = useTween(1700, true, true);
  const { d, length } = ringPath(size, 10);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <GradientRing size={size} d={d} length={length} value={Math.round(72 * t)} id="ink" />
      <Text style={styles.demoNum}>{Math.round(360 * t)}</Text>
      <Text style={styles.demoWord}>Ink</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: colours.text, fontFamily: serif, fontSize: 64, marginTop: 18 },
  slogan: { color: colours.slate, fontSize: 11, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 },
  walk: { flex: 1, padding: 24 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skip: { color: colours.slate, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600' },
  body: { flex: 1, justifyContent: 'center' },
  art: { alignItems: 'center', justifyContent: 'center', minHeight: 230, marginBottom: 26 },
  eyebrow: { color: colours.foil, fontSize: 11, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 },
  title: { color: colours.text, fontFamily: serif, fontSize: 40, lineHeight: 44, marginBottom: 12, fontVariant: ['lining-nums'] },
  text: { fontSize: 15, lineHeight: 23 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colours.line },
  dotOn: { width: 22, backgroundColor: colours.accent },
  actions: { flexDirection: 'row', gap: 10 },
  finger: { position: 'absolute', width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 2, borderColor: '#FFFFFF' },
  demoNum: { color: '#FFFFFF', fontFamily: serif, fontSize: 52, fontVariant: ['lining-nums', 'tabular-nums'] },
  demoWord: { color: '#FFFFFF', fontSize: 10, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase' },
  ringLabel: { color: colours.slate, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 8 },
  matchText: { color: colours.foil, fontFamily: serif, fontSize: 26, marginTop: 12 },
}));
