// The Dial: hold a photo or video, then turn your finger around it to wind a glowing line
// around its frame from 1 to 100. Let go to set it. Owners see only averages, never who.
//
// What makes it feel precise:
// - half a turn covers the whole range; turning near the centre is finer than near the edge
// - a light tap of haptics at every 10, a firmer one at 50 and at 100
// - ten notches round the frame light up as you pass them
// - the line glows in the Dial gradient, led by a bright point, and blooms gold at 100
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { angleAt, applyRotation, dialWord, framePath, framePoint, precisionFactor, ringPath, ringPoint } from '../core/gauge';
import { DIAL_GRADIENT, colours, radius, serif, themed } from '../theme';
import { play, tick } from '../sound';

const HOLD_MS = 180;
const STROKE = 6;
const NOTCHES = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const STEP = 10;
const MIN = 1;   // the Dial runs from 1 to 100

type Props = {
  width: number;
  height: number;
  score: number | null | undefined;      // the Dial already set, if any
  onRate: (score: number) => void;
  onActiveChange?: (active: boolean) => void;  // lets a parent ScrollView pause scrolling
  disabled?: boolean;
  shape?: 'frame' | 'ring';   // frame: around a photo; ring: the round Dial for a whole profile
  threshold?: number;         // marks the match line on the ring
  showPill?: boolean;
  children: React.ReactNode;
};

const buzz = (kind: 'start' | 'tick' | 'major' | 'done') => {
  if (Platform.OS === 'web') return;
  const p = kind === 'tick' ? Haptics.selectionAsync()
    : kind === 'done' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(kind === 'major' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium);
  p.catch(() => {});
};

let gradientSeq = 0;

export function PowerGauge({ width, height, score, onRate, onActiveChange, disabled, shape = 'frame', threshold, showPill = true, children }: Props) {
  const [active, setActive] = useState(false);
  const [value, setValue] = useState(0);
  const [fine, setFine] = useState(false);
  const bloom = useRef(new Animated.Value(0)).current;
  const frame = useRef<React.ComponentRef<typeof View>>(null);
  const ids = useMemo(() => { gradientSeq += 1; return { line: `dial-line-${gradientSeq}`, glow: `dial-glow-${gradientSeq}` }; }, []);
  const s = useRef({ active: false, value: 0, centre: { x: 0, y: 0 }, lastAngle: null as number | null,
                     timer: null as ReturnType<typeof setTimeout> | null, moved: false });
  const latest = useRef({ score, onRate, onActiveChange, disabled });
  latest.current = { score, onRate, onActiveChange, disabled };

  const celebrate = () => {
    bloom.setValue(0);
    Animated.timing(bloom, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }).start();
  };
  useEffect(() => () => { if (s.current.timer) clearTimeout(s.current.timer); }, []);

  const responder = useMemo(() => {
    const stop = (submit: boolean) => {
      const st = s.current;
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      if (!st.active) return;
      st.active = false; setActive(false); setFine(false); latest.current.onActiveChange?.(false);
      if (submit && st.moved) {
        const v = Math.max(MIN, Math.round(st.value));
        buzz(v >= 100 ? 'done' : 'major');
        play(v >= 100 ? 'full' : 'lock');
        if (v >= 100) celebrate();
        latest.current.onRate(v);
      }
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled,
      onPanResponderGrant: () => {
        const st = s.current;
        frame.current?.measureInWindow((x: number, y: number, w: number, h: number) => { st.centre = { x: x + w / 2, y: y + h / 2 }; });
        st.timer = setTimeout(() => {
          st.active = true; st.moved = false; st.lastAngle = null; st.value = Math.max(MIN, latest.current.score ?? MIN);
          setValue(st.value); setActive(true); latest.current.onActiveChange?.(true); buzz('start'); play('open', 0.6);
        }, HOLD_MS);
      },
      onPanResponderMove: (e) => {
        const st = s.current;
        if (!st.active) return;
        const { pageX, pageY } = e.nativeEvent;
        const a = angleAt(pageX, pageY, st.centre.x, st.centre.y);
        if (a == null) { st.lastAngle = null; return; }
        if (st.lastAngle != null) {
          const factor = precisionFactor(pageX, pageY, st.centre.x, st.centre.y, Math.min(width, height) / 2);
          const next = applyRotation(st.value, st.lastAngle, a, factor, MIN);
          if (Math.floor(next / 5) !== Math.floor(st.value / 5)) tick(next);
          const before = Math.floor(st.value / STEP), after = Math.floor(next / STEP);
          if (before !== after) buzz(after * STEP === 50 || after * STEP === 100 || before * STEP === 50 ? 'major' : 'tick');
          if (next !== st.value) st.moved = true;
          st.value = next; setValue(next); setFine(factor < 0.7);
        }
        st.lastAngle = a;
      },
      onPanResponderTerminationRequest: () => !s.current.active,
      onShouldBlockNativeResponder: () => true,
      onPanResponderRelease: () => stop(true),
      onPanResponderTerminate: () => stop(false),
    });
  }, [width, height]);

  const inset = STROKE / 2 + 4;
  const ring = shape === 'ring';
  const { d, length } = useMemo(() => ring ? ringPath(width, inset) : framePath(width, height, radius.card, inset), [width, height, ring]);
  const pointAt = (dist: number) => ring ? ringPoint(width, inset, dist) : framePoint(width, height, radius.card, inset, dist);
  const shown = active ? value : score ?? 0;
  const full = Math.round(shown) >= 100;
  const tip = pointAt((length * shown) / 100);
  const dash = `${(length * shown) / 100} ${length}`;
  const [c1, c2, c3] = DIAL_GRADIENT;

  // Screen readers: swipe up or down to move the Dial by 10.
  const onAccessibilityAction = (e: { nativeEvent: { actionName: string } }) => {
    const now = score ?? 0;
    const next = e.nativeEvent.actionName === 'increment' ? Math.min(100, now + STEP) : Math.max(MIN, now - STEP);
    if (next !== now) onRate(next);
  };

  return (
    <View ref={frame} {...responder.panHandlers}
      accessible accessibilityRole="adjustable" accessibilityLabel="The Dial"
      accessibilityValue={{ min: MIN, max: 100, now: Math.round(shown), text: `${Math.round(shown)}, ${dialWord(shown)}` }}
      accessibilityHint="Hold, then turn your finger around the photo to set the Dial from 1 to 100"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={onAccessibilityAction}
      style={[styles.frame, { width, height }, ring && { borderRadius: width / 2 }, webNoSelect]}>
      {children}
      {active && <View style={styles.dim} pointerEvents="none" />}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id={ids.line} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c1} /><Stop offset="0.5" stopColor={c2} /><Stop offset="1" stopColor={c3} />
          </LinearGradient>
          <RadialGradient id={ids.glow} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={full ? colours.foil : c2} stopOpacity={0.55} />
            <Stop offset="1" stopColor={full ? colours.foil : c3} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* ambient bloom behind the number, growing with the value */}
        {active && <Circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * (0.22 + 0.2 * (shown / 100))} fill={`url(#${ids.glow})`} />}

        <Path d={d} stroke="rgba(255,255,255,0.28)" strokeWidth={active ? STROKE : 2} fill="none" />

        {/* the match line */}
        {threshold != null && (() => { const p = pointAt((length * threshold) / 100); return <>
          <Circle cx={p.x} cy={p.y} r={7} fill={colours.foil} fillOpacity={0.25} />
          <Circle cx={p.x} cy={p.y} r={3.5} fill={colours.foil} />
        </>; })()}

        {/* notches at every 10 while turning */}
        {active && NOTCHES.map((n) => {
          const p = pointAt((length * n) / 100);
          const reached = shown >= n;
          return <Circle key={n} cx={p.x} cy={p.y} r={n === 50 ? 3.4 : 2.4} fill={reached ? '#FFFFFF' : 'rgba(255,255,255,0.45)'} />;
        })}

        {shown > 0 && <>
          {/* soft glow in layers, then the line itself */}
          <Path d={d} stroke={`url(#${ids.line})`} strokeOpacity={0.14} strokeWidth={STROKE + 16} strokeLinecap="round" fill="none" strokeDasharray={dash} />
          <Path d={d} stroke={`url(#${ids.line})`} strokeOpacity={0.28} strokeWidth={STROKE + 8} strokeLinecap="round" fill="none" strokeDasharray={dash} />
          <Path d={d} stroke="rgba(255,255,255,0.9)" strokeWidth={STROKE + 2} strokeLinecap="round" fill="none" strokeDasharray={dash} />
          <Path d={d} stroke={full ? colours.foil : `url(#${ids.line})`} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={dash} />
          {/* the leading point */}
          {!full && <>
            <Circle cx={tip.x} cy={tip.y} r={active ? 13 : 8} fill={c2} fillOpacity={0.3} />
            <Circle cx={tip.x} cy={tip.y} r={active ? 5.5 : 4} fill="#FFFFFF" />
          </>}
        </>}
      </Svg>

      {/* gold bloom when the Dial is set to 100 */}
      <Animated.View pointerEvents="none" style={[styles.burst, ring && { borderRadius: width / 2 }, {
        opacity: bloom.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
        transform: [{ scale: bloom.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] }) }],
      }]} />

      {active ? (
        <View style={styles.centre} pointerEvents="none">
          <Text style={[styles.big, ring && width < 260 && { fontSize: 64 }]}>{Math.round(value)}</Text>
          <Text style={styles.word}>{threshold != null && value >= threshold ? 'Interested' : dialWord(value)}</Text>
          {!ring && <Text style={styles.hint}>{fine ? 'Fine control' : 'Turn to adjust · closer to the middle for finer control'}</Text>}
        </View>
      ) : showPill && (
        <View style={styles.pill} pointerEvents="none">
          <Text style={styles.pillText}>{score == null ? 'Hold and turn the Dial' : `Your Dial: ${Math.round(score)}`}</Text>
        </View>
      )}
    </View>
  );
}

// On the web a held drag would otherwise select text or scroll the page.
const webNoSelect = Platform.OS === 'web' ? ({ userSelect: 'none', touchAction: 'none', cursor: 'grab' } as any) : null;

const fill = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } as const;

const styles = themed(() => StyleSheet.create({
  frame: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colours.surface },
  dim: { ...fill, backgroundColor: 'rgba(18,20,42,0.5)' },
  centre: { ...fill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  big: { color: colours.onMedia, fontSize: 92, fontFamily: serif, fontVariant: ['lining-nums', 'tabular-nums'] },
  word: { color: colours.onMedia, fontSize: 18, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: -4 },
  hint: { color: colours.onMedia, opacity: 0.8, fontSize: 12, marginTop: 10, textAlign: 'center' },
  pill: { position: 'absolute', right: 14, bottom: 14, backgroundColor: 'rgba(18,20,42,0.62)', borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  pillText: { color: colours.onMedia, fontSize: 12, fontWeight: '600' },
  burst: { ...fill, borderRadius: radius.card, borderWidth: 10, borderColor: colours.foil },
}));
