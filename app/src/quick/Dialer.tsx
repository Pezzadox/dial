// Dial one person's five photos or videos, full screen. Turn around the middle and let go to lock it in;
// the next one slides straight in. After the fifth, their score lands.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { angleAt, applyRotation, dialWord, precisionFactor } from '../core/gauge';
import { play, tick } from '../sound';
import { colours, serif } from '../theme';
import { Button } from '../components/ui';
import { quick, type DialResult } from './api';
import { QD, SECTION, friendly, weighted, type QPerson } from './core';
import { MediaFull, PersonCircle, Ring } from './Visual';

const START = 0;
/** The Dial sits a little below the middle, leaving room above it for stories. Turning is measured round this point. */
export const dialCentre = (w: number, h: number) => ({ x: w / 2, y: h * 0.56, r: Math.min(w * 0.62, h * 0.4) / 2 });

/** "Looks · 2 of 5", "Vibe", "Personality · 4 of 5" */
function sectionLabel(person: QPerson, i: number) {
  const kind = person.media[i].kind;
  const same = person.media.filter((m) => m.kind === kind);
  const at = person.media.slice(0, i + 1).filter((m) => m.kind === kind).length;
  return same.length > 1 ? `${SECTION[kind]} · ${at} of ${same.length}` : SECTION[kind];
}
const buzz = (heavy?: boolean) => { if (Platform.OS !== 'web') (heavy ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy) : Haptics.selectionAsync()).catch(() => {}); };
const nativeDriver = Platform.OS !== 'web';

export function Dialer({ person, round, rounds, onClose, onNext, onChat }:
  { person: QPerson; round: number; rounds: number; onClose: () => void; onNext: () => void; onChat: () => void }) {
  const [roundAtStart] = useState(round);
  const { width, height } = useWindowDimensions();
  const n = person.media.length;
  const [i, setI] = useState(0);
  const [value, setValue] = useState(START);
  // Scores stay on the phone until Submit, so any of the five can be changed.
  const [scores, setScores] = useState<(number | null)[]>(() => person.media.map(() => null));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Extract<DialResult, { complete: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const send = useRef(new Animated.Value(0)).current;
  // While sending, the Dial sweeps from where it was to the average of the five.
  const [sendT, setSendT] = useState(0);
  useEffect(() => { const id = send.addListener(({ value: v }) => setSendT(v)); return () => send.removeListener(id); }, []);
  const st = useRef({ value: START, last: null as number | null, moved: false, busy: false, i: 0, scores: scores });
  st.current.i = i; st.current.scores = scores;
  const dims = useRef({ width, height }); dims.current = { width, height };
  const media = person.media[i];
  const allDone = scores.every((x) => x != null);
  const firstOpen = scores.findIndex((x) => x == null);

  /** Show photo k, with its Dial where it was left (or 0). */
  const goTo = (k: number, dir: 1 | -1 = 1) => {
    if (k < 0 || k >= n || k === st.current.i || st.current.busy) return;
    Animated.timing(slide, { toValue: dir, duration: 150, useNativeDriver: nativeDriver }).start(() => {
      const v = st.current.scores[k] ?? START;
      setI(k); st.current.value = v; setValue(v); slide.setValue(-dir);
      Animated.timing(slide, { toValue: 0, duration: 190, useNativeDriver: nativeDriver }).start();
    });
  };

  /** Lock the current Dial. Moves on to the next one still to do; on the last, waits for Submit. */
  const lock = () => {
    const s = st.current;
    const v = Math.round(s.value);
    if (v < 1 || s.busy) return;
    play(v >= 100 ? 'full' : 'lock'); buzz(true);
    const next = [...s.scores]; next[s.i] = v; s.scores = next; setScores(next);
    // Move on to the next one still to dial. Once all five are in, stay put: Submit is right there.
    const open = next.findIndex((x) => x == null);
    if (open !== -1) goTo(open, open > s.i ? 1 : -1);
  };
  const lockRef = useRef(lock); lockRef.current = lock;

  /** Submit all five: send them, then the send-off animation, then their score. */
  const submit = async () => {
    const s = st.current; if (s.busy || !s.scores.every((x) => x != null)) return;
    s.busy = true; setSending(true); setError(null); buzz(true);
    play('open', 0.7);
    const anim = new Promise<void>((done) => Animated.timing(send, { toValue: 1, duration: 950, easing: Easing.bezier(0.6, 0, 0.3, 1), useNativeDriver: nativeDriver }).start(() => done()));
    try {
      let r: DialResult | null = null;
      for (let k = 0; k < n; k++) r = await quick.dial(person.id, person.media[k].id, s.scores[k]!);
      await anim;
      if (r?.complete) { setResult(r); play(r.mutual ? 'match' : 'reward', 0.85); }
    } catch (e: any) {
      setError(friendly(e)); setSending(false); send.setValue(0); s.busy = false;
    }
  };

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { st.current.last = null; st.current.moved = false; },
    onPanResponderMove: (e) => {
      const s = st.current; if (s.busy) return;
      const { width: w, height: h } = dims.current;
      const x = e.nativeEvent.pageX, y = e.nativeEvent.pageY;
      const c = dialCentre(w, h);
      const a = angleAt(x, y, c.x, c.y);
      if (a == null) { s.last = null; return; }
      if (s.last != null) {
        const factor = precisionFactor(x, y, c.x, c.y, c.r);
        const next = applyRotation(s.value, s.last, a, factor, 0);
        if (Math.floor(next / 5) !== Math.floor(s.value / 5)) { tick(next); buzz(); }
        if (next !== s.value) s.moved = true;
        s.value = next; setValue(next);
      }
      s.last = a;
    },
    onPanResponderRelease: () => { st.current.last = null; if (st.current.moved) lockRef.current(); },
  }), []);

  // Keyboard on the web: arrows to turn, Enter to lock (or submit when all five are in).
  useEffect(() => {
    if (Platform.OS !== 'web' || result) return;
    const onKey = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 10 : 1, s = st.current;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { s.value = Math.min(100, s.value + step); setValue(s.value); tick(s.value); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { s.value = Math.max(0, s.value - step); setValue(s.value); tick(s.value); }
      else if (e.key === 'Enter') {
        const done = s.scores.every((x) => x != null) && Math.round(s.value) === s.scores[s.i];
        done ? submitRef.current() : lockRef.current();
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [result]);
  const submitRef = useRef(submit); submitRef.current = submit;

  const centre = dialCentre(width, height);
  const ring = centre.r * 2;
  const compact = height < 700;
  const shift = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [width * 0.25, 0, -width * 0.25] });
  const fade = slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] });

  if (result) {
    const last = roundAtStart >= rounds;
    return (
      <ScrollView style={[StyleSheet.absoluteFill, styles.resultBg]} contentContainerStyle={[styles.result, { minHeight: height }]}>
        <Text style={styles.kicker}>{result.mutual ? 'Dialled in ✦' : rounds >= QD.unlimited ? `Round ${roundAtStart}` : `Round ${roundAtStart} of ${rounds} today`}</Text>
        <PersonCircle look={person.look} photo={person.media[0]} size={Math.min(width * 0.6, 260, height * 0.26)} score={result.score} glow={result.mutual} />
        <Text style={styles.resultName}>{person.firstName}, {person.age}</Text>
        <Text style={[styles.resultScore, compact && { fontSize: 64, lineHeight: 72 }]}>{result.score}</Text>
        <Text style={styles.resultWord}>{dialWord(result.score)}</Text>
        <View style={styles.dots}>
          <Text style={styles.dotScore}>Looks {result.looks}</Text>
          <Text style={styles.dotScore}>Vibe {result.vibe}</Text>
          <Text style={styles.dotScore}>Personality {result.personality}</Text>
        </View>
        {result.mutual
          ? <Text style={styles.mutual}>{person.firstName} dialled you high too. You'll both get a nudge to say hi.</Text>
          : <Text style={styles.note}>Only you see this number. {person.firstName} can message you, and you them.</Text>}
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 22 }}>
          {result.mutual && <Button label={`Say hi to ${person.firstName}`} onPress={onChat} />}
          <Button kind={result.mutual ? 'quiet' : 'primary'} label={last ? 'See your scorecard' : 'Next round'} onPress={onNext} />
        </View>
      </ScrollView>
    );
  }

  // The send-off: the five scores pull into the Dial, it fills to their average, and the whole thing lifts away.
  const avg = weighted(person.media.map((m, k) => ({ kind: m.kind, score: scores[k] ?? 0 }))).score;
  const lift = send.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0, 10, -height * 0.75] });
  const shrink = send.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1, 1.08, 0.25] });
  const vanish = send.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] });
  const chipsIn = send.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });
  const flash = send.interpolate({ inputRange: [0, 0.5, 0.8, 1], outputRange: [0, 0, 0.55, 0] });
  const current = scores[i];
  const changed = current != null && Math.round(value) !== current;
  const onLast = allDone && !changed;

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]} {...(sending ? {} : pan.panHandlers)}
      accessible accessibilityRole="adjustable" accessibilityLabel={`Dial for ${person.firstName}'s ${media.kind} ${i + 1} of ${n}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value), text: `${Math.round(value)}, ${dialWord(value)}` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate', label: onLast ? 'Submit' : 'Lock in' }]}
      onAccessibilityAction={(e) => {
        const s = st.current;
        if (e.nativeEvent.actionName === 'increment') { s.value = Math.min(100, Math.round(s.value) + 5); setValue(s.value); }
        else if (e.nativeEvent.actionName === 'decrement') { s.value = Math.max(0, Math.round(s.value) - 5); setValue(s.value); }
        else onLast ? submit() : lock();
      }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, transform: [{ translateX: shift }] }]} pointerEvents="none">
        <MediaFull media={media} look={person.look} width={width} height={height} />
        {media.kind !== 'story' && <View style={[StyleSheet.absoluteFill, styles.scrim]} />}
      </Animated.View>

      <View style={styles.top} pointerEvents="box-none">
        <Pressable onPress={onClose} disabled={sending} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back to the circles"><Feather name="x" size={22} color="#fff" /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.name}>{person.firstName}, {person.age}</Text>
          {!!person.city && <Text style={styles.city}>{person.city}</Text>}
        </View>
        <Text style={styles.count}>{i + 1}/{n}</Text>
      </View>

      {/* Tap any done one (or the next to do) to go back and change it. */}
      <Animated.View style={[styles.progress, { opacity: send.interpolate({ inputRange: [0, 0.3], outputRange: [1, 0], extrapolate: 'clamp' }) }]} pointerEvents="box-none">
        {person.media.map((m, k) => {
          const done = scores[k] != null, reachable = done || k === firstOpen;
          const newSection = k > 0 && person.media[k - 1].kind !== m.kind;
          return (
            <Pressable key={k} onPress={() => goTo(k, k > i ? 1 : -1)} disabled={!reachable || sending}
              style={[styles.seg, newSection && { marginLeft: 6 }, done && styles.segDone, k === i && styles.segNow]}
              accessibilityRole="button" accessibilityLabel={done ? `Change ${k + 1}: ${scores[k]}` : `Photo ${k + 1}, not dialled yet`}>
              {done ? <Text style={styles.segText}>{scores[k]}</Text> : null}
            </Pressable>
          );
        })}
      </Animated.View>
      <Text style={styles.editHint} pointerEvents="none">
        {allDone ? `All ${n} in · tap a score to change it` : sectionLabel(person, i)}
      </Text>

      <Animated.View style={[styles.ringWrap, { left: centre.x - ring / 2, top: centre.y - ring / 2, opacity: vanish, transform: [{ translateY: lift }, { scale: shrink }] }]} pointerEvents="none"
        accessibilityRole="adjustable" accessibilityLabel={`Dial for ${person.firstName}'s ${media.kind}`} accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}>
        <Ring value={sending ? value + (avg - value) * Math.min(1, sendT / 0.45) : value} size={ring} word={sending ? 'Sending' : dialWord(value)} />
      </Animated.View>

      {/* The five scores fly into the middle of the Dial. */}
      {sending && scores.map((sc, k) => {
        const fromX = (k - (n - 1) / 2) * (width / (n + 0.6));
        return (
          <Animated.Text key={k} pointerEvents="none" style={[styles.flyChip, {
            left: centre.x - 22, top: centre.y - 14,
            opacity: chipsIn.interpolate({ inputRange: [0, 0.1, 0.85, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: chipsIn.interpolate({ inputRange: [0, 1], outputRange: [fromX, 0] }) },
              { translateY: chipsIn.interpolate({ inputRange: [0, 1], outputRange: [-(centre.y - 84), 0] }) },
              { scale: chipsIn.interpolate({ inputRange: [0, 1], outputRange: [1, 0.4] }) },
            ] }]}>{sc}</Animated.Text>
        );
      })}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colours.foil, opacity: flash }]} />

      <Animated.View style={[styles.footer, { opacity: send.interpolate({ inputRange: [0, 0.25], outputRange: [1, 0], extrapolate: 'clamp' }) }]} pointerEvents={sending ? 'none' : 'box-none'}>
        <Text style={styles.hint}>{scores.every((x) => x == null) && value === 0 ? 'Turn around the middle · let go to lock it in'
          : onLast ? `All ${n} in. Happy with them?` : 'Gold mark = 70, or the top of your own range. Both high and you\'re dialled in'}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => goTo(i - 1, -1)} disabled={i === 0} style={[styles.undo, i === 0 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Previous photo" hitSlop={8}>
            <Feather name="chevron-left" size={22} color="#fff" />
          </Pressable>
          {onLast
            ? <Button label={`Submit ${person.firstName}  ✦`} onPress={submit} style={{ flex: 1 }} />
            : <Button label={Math.round(value) < 1 ? 'Turn the Dial' : changed ? `Change to ${Math.round(value)}` : `Lock in ${Math.round(value)}`} onPress={lock} disabled={Math.round(value) < 1} style={{ flex: 1 }} />}
        </View>
        {!!error && <Text style={{ color: colours.danger, marginTop: 8 }}>{error}</Text>}
      </Animated.View>
    </View>
  );
}


const styles = StyleSheet.create({
  stage: { zIndex: 50, backgroundColor: '#000', ...(Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: 'grab' } as any) : null) },
  scrim: { backgroundColor: 'rgba(8,7,15,0.38)' },
  top: { position: 'absolute', top: 18, left: 20, right: 20, flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontFamily: serif, fontSize: 26 },
  city: { color: 'rgba(255,255,255,0.75)', fontSize: 12, letterSpacing: 0.5 },
  count: { color: '#fff', fontSize: 13, fontWeight: '700', width: 30, textAlign: 'right' },
  progress: { position: 'absolute', top: 72, left: 16, right: 16, flexDirection: 'row', gap: 3 },
  seg: { flex: 1, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  segDone: { backgroundColor: 'rgba(234,219,194,0.9)' },
  segNow: { borderWidth: 1.5, borderColor: '#fff' },
  segText: { color: '#08070F', fontSize: 9, fontWeight: '800' },
  ringWrap: { position: 'absolute' },
  editHint: { position: 'absolute', top: 98, alignSelf: 'center', color: '#EADBC2', fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  flyChip: { position: 'absolute', width: 44, textAlign: 'center', color: '#08070F', backgroundColor: 'rgba(234,219,194,0.95)', borderRadius: 14, overflow: 'hidden', paddingVertical: 5, fontSize: 13, fontWeight: '800' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 30, alignItems: 'center', alignSelf: 'center', maxWidth: 460, marginHorizontal: 'auto' as any },
  hint: { color: 'rgba(255,255,255,0.88)', fontSize: 12, letterSpacing: 0.5, textAlign: 'center', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', alignItems: 'center' },
  undo: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  resultBg: { zIndex: 50, backgroundColor: 'rgba(8,7,15,0.96)' },
  result: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  kicker: { color: colours.foil, fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 20 },
  resultName: { color: '#fff', fontFamily: serif, fontSize: 30, marginTop: 18 },
  resultScore: { color: '#fff', fontFamily: serif, fontSize: 92, lineHeight: 100, fontVariant: ['lining-nums'] },
  resultWord: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', gap: 8, marginTop: 14 },
  dotScore: { color: 'rgba(255,255,255,0.7)', fontSize: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, fontVariant: ['tabular-nums'] },
  mutual: { color: colours.foil, textAlign: 'center', marginTop: 16, fontSize: 15, lineHeight: 21 },
  note: { color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 16, fontSize: 13, lineHeight: 19 },
});
