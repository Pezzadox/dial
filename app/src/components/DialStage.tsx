// The full-screen Dial. Hold or tap a circular photo: it fills the screen, and a ring Dial
// sits in the middle and winds round as you turn. Hold-turn-release sets it in one motion;
// a tap opens it so you can drag around the ring, then tap "Set".
import React, { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import type { Media } from '../api';
import { angleAt, applyRotation, dialWord, precisionFactor, ringPath, ringPoint } from '../core/gauge';
import { play, tick } from '../sound';
import { DIAL_GRADIENT, colours, serif, themed } from '../theme';
import { MediaTile } from './MediaTile';
import { Button } from './ui';

const MIN = 1, STROKE = 10;
type Mode = 'held' | 'interactive';
type Session = { media: Media; start: number; onSet: (v: number) => void };
type Stage = {
  begin: (s: Session, mode: Mode) => void;
  move: (pageX: number, pageY: number) => void;
  end: () => void;            // finger lifted after a hold
};
const Ctx = createContext<Stage | null>(null);
export const useDialStage = () => useContext(Ctx)!;

const buzz = (kind: 'tick' | 'major' | 'done') => {
  if (Platform.OS === 'web') return;
  (kind === 'tick' ? Haptics.selectionAsync() : kind === 'done' ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)).catch(() => {});
};

export function DialStageProvider({ children }: { children: React.ReactNode }) {
  const { width, height } = useWindowDimensions();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('held');
  const [value, setValue] = useState(MIN);
  const [fine, setFine] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const st = useRef({ value: MIN, last: null as number | null, moved: false, session: null as Session | null, mode: 'held' as Mode });
  const dims = useRef({ width, height }); dims.current = { width, height };

  const show = (on: boolean, after?: () => void) =>
    Animated.timing(fade, { toValue: on ? 1 : 0, duration: on ? 160 : 140, useNativeDriver: Platform.OS !== 'web' }).start(() => after?.());

  const close = () => show(false, () => { setSession(null); st.current.session = null; });
  const commit = () => {
    const s = st.current; if (!s.session) return;
    const v = Math.max(MIN, Math.round(s.value));
    if (v >= 100) { play('full'); buzz('done'); } else { play('lock'); buzz('major'); }
    s.session.onSet(v);
    setTimeout(close, v >= 100 ? 420 : 200);
  };

  const stage = useMemo<Stage>(() => ({
    begin: (sess, m) => {
      const v = Math.max(MIN, sess.start);
      st.current = { value: v, last: null, moved: false, session: sess, mode: m };
      setSession(sess); setMode(m); setValue(v); setFine(false);
      play('open', 0.7); show(true);
    },
    move: (x, y) => {
      const s = st.current; if (!s.session) return;
      const { width: w, height: h } = dims.current;
      const a = angleAt(x, y, w / 2, h / 2);
      if (a == null) { s.last = null; return; }
      if (s.last != null) {
        const factor = precisionFactor(x, y, w / 2, h / 2, Math.min(w, h) * 0.32);
        const next = applyRotation(s.value, s.last, a, factor, MIN);
        if (Math.floor(next / 5) !== Math.floor(s.value / 5)) tick(next);
        const b10 = Math.floor(s.value / 10), a10 = Math.floor(next / 10);
        if (a10 !== b10) buzz(a10 * 10 === 50 || a10 * 10 === 100 ? 'major' : 'tick');
        if (next !== s.value) s.moved = true;
        s.value = next; setValue(next); setFine(factor < 0.7);
      }
      s.last = a;
    },
    end: () => {
      const s = st.current; if (!s.session) return;
      s.last = null;
      if (s.mode === 'held' && s.moved) commit();
      else { s.mode = 'interactive'; setMode('interactive'); }   // a tap or a still hold leaves it open to drag
    },
  }), []);

  // In interactive mode the whole screen is the Dial: drag anywhere around the middle.
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { st.current.last = null; },
    onPanResponderMove: (e) => stage.move(e.nativeEvent.pageX, e.nativeEvent.pageY),
    onPanResponderRelease: () => { st.current.last = null; },
  }), [stage]);

  const size = Math.min(width, height) * 0.66;
  const inset = STROKE / 2 + 10;
  const { d, length } = ringPath(size, inset);
  const tip = ringPoint(size, inset, (length * value) / 100);
  const dash = `${(length * value) / 100} ${length}`;
  const full = Math.round(value) >= 100;
  const [c1, c2, c3] = DIAL_GRADIENT;

  return (
    <Ctx.Provider value={stage}>
      {children}
      {session && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.stage, { opacity: fade }]} pointerEvents={mode === 'interactive' ? 'auto' : 'none'}>
          <MediaTile media={session.media} width={width} height={height} small play />
          <View style={[StyleSheet.absoluteFill, styles.scrim]} />
          <View style={StyleSheet.absoluteFill} {...(mode === 'interactive' ? pan.panHandlers : {})} />
          <View style={[styles.ringWrap, { left: (width - size) / 2, top: (height - size) / 2, width: size, height: size }]} pointerEvents="none">
            <Svg width={size} height={size}>
              <Defs>
                <LinearGradient id="stageLine" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={c1} /><Stop offset="0.5" stopColor={c2} /><Stop offset="1" stopColor={c3} />
                </LinearGradient>
                <RadialGradient id="stageGlow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={full ? colours.foil : c2} stopOpacity={0.5} />
                  <Stop offset="1" stopColor={full ? colours.foil : c3} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size * (0.3 + 0.2 * value / 100)} fill="url(#stageGlow)" />
              <Path d={d} stroke="rgba(255,255,255,0.2)" strokeWidth={STROKE} fill="none" />
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => {
                const p = ringPoint(size, inset, (length * n) / 100);
                return <Circle key={n} cx={p.x} cy={p.y} r={n === 50 ? 4 : 2.6} fill={value >= n ? '#FFFFFF' : 'rgba(255,255,255,0.4)'} />;
              })}
              <Path d={d} stroke="url(#stageLine)" strokeOpacity={0.18} strokeWidth={STROKE + 22} strokeLinecap="round" fill="none" strokeDasharray={dash} />
              <Path d={d} stroke="url(#stageLine)" strokeOpacity={0.35} strokeWidth={STROKE + 10} strokeLinecap="round" fill="none" strokeDasharray={dash} />
              <Path d={d} stroke={full ? colours.foil : 'url(#stageLine)'} strokeWidth={STROKE} strokeLinecap="round" fill="none" strokeDasharray={dash} />
              <Circle cx={tip.x} cy={tip.y} r={18} fill={full ? colours.foil : c2} fillOpacity={0.35} />
              <Circle cx={tip.x} cy={tip.y} r={8} fill="#FFFFFF" />
            </Svg>
            <View style={[StyleSheet.absoluteFill, styles.centre]}>
              <Text style={styles.big}>{Math.round(value)}</Text>
              <Text style={styles.word}>{dialWord(value)}</Text>
            </View>
          </View>
          <View style={styles.footer} pointerEvents={mode === 'interactive' ? 'box-none' : 'none'}>
            <Text style={styles.hint}>{mode === 'held' ? 'Turn around the middle · let go to set' : fine ? 'Fine control' : 'Drag around the ring · closer to the middle for finer control'}</Text>
            {mode === 'interactive' && (
              <View style={styles.actions}>
                <Button kind="quiet" label="Cancel" onPress={close} style={styles.action} />
                <Button label={`Set ${Math.round(value)}`} onPress={commit} style={styles.action} />
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

const styles = themed(() => StyleSheet.create({
  stage: { zIndex: 100, backgroundColor: '#000' },
  scrim: { backgroundColor: 'rgba(8,7,15,0.55)' },
  ringWrap: { position: 'absolute' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  big: { color: '#FFFFFF', fontFamily: serif, fontSize: 104, fontVariant: ['lining-nums', 'tabular-nums'] },
  word: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase', marginTop: -6 },
  footer: { position: 'absolute', left: 24, right: 24, bottom: 40, alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, letterSpacing: 0.6, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  action: { flex: 1, borderColor: 'rgba(255,255,255,0.4)' },
}));
