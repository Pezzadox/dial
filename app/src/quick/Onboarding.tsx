// Quick Dial's opening: the logo, three fast cards, then one setup screen. Under a minute to your first Dial.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Feather from '@expo/vector-icons/Feather';
import { api } from '../api';
import { Logo } from '../components/Logo';
import { DobInput } from '../components/DobInput';
import { ageOn, dobToIso } from '../core/dob';
import { Button, H1, Muted } from '../components/ui';
import { dialWord } from '../core/gauge';
import { useTween } from '../screens/Intro';
import { play } from '../sound';
import { colours, radius, serif, themed } from '../theme';
import { quick, type QProfile } from './api';
import { DISTANCES, QD, STORY_MAX, STORY_PROMPTS, friendly, type QMedia } from './core';
import { PersonCircle, Ring } from './Visual';

const nativeDriver = Platform.OS !== 'web';

export function QuickSplash({ onDone }: { onDone: () => void }) {
  const ring = useTween(1100, true);
  const rise = useRef(new Animated.Value(0)).current;
  const done = useRef(false);
  const finish = () => { if (!done.current) { done.current = true; onDone(); } };
  useEffect(() => {
    play('intro', 0.8);
    Animated.timing(rise, { toValue: 1, duration: 600, delay: 500, easing: Easing.out(Easing.cubic), useNativeDriver: nativeDriver }).start();
    const t = setTimeout(finish, 2200); return () => clearTimeout(t);
  }, []);
  return (
    <Pressable style={styles.center} onPress={finish} accessibilityRole="button" accessibilityLabel="Skip intro">
      <Logo size={150} progress={ring} />
      <Animated.View style={{ alignItems: 'center', opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <Text style={styles.wordmark}>quick dial</Text>
        <Text style={styles.slogan}>Five dials. One spark.</Text>
      </Animated.View>
    </Pressable>
  );
}

const SAMPLE = [
  { hairColour: 'red', hairLength: 'long', eyeColour: 'green', build: 'athletic' },
  { hairColour: 'black', hairLength: 'short', eyeColour: 'brown', build: 'average' },
  { hairColour: 'blonde', hairLength: 'medium', eyeColour: 'blue', build: 'curvy' },
];

export function QuickIntro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const t = useTween(1800, step === 1, true);
  const value = Math.round(82 * t);
  const cards = [
    { title: 'Pick a circle', body: 'Ten verified people at a time. Flick through their photos, video and stories, then choose who to dial.',
      art: <View style={{ flexDirection: 'row', gap: 10 }}>{SAMPLE.map((l, k) => <PersonCircle key={k} look={l} size={k === 1 ? 110 : 84} glow={k === 1} />)}</View> },
    { title: 'Dial looks and personality', body: '5 photos, a talking video and 5 short stories, 0 to 100 each. Personality counts as much as looks.',
      art: <Ring value={value} size={200} word={dialWord(value)} /> },
    { title: 'Both dial high? You\'re dialled in', body: 'You\'ll both get a nudge to say hi, or find them in tonight\'s 8pm drop. Your own Dial builds over time.',
      art: <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><PersonCircle look={SAMPLE[0]} size={100} score={86} glow /><Text style={styles.spark}>✦</Text><PersonCircle look={SAMPLE[1]} size={100} score={78} glow /></View> },
  ];
  const c = cards[step];
  return (
    <View style={[styles.center, { padding: 28 }]}>
      <View style={{ height: 230, justifyContent: 'center' }}>{c.art}</View>
      <Text style={styles.cardTitle}>{c.title}</Text>
      <Muted style={{ textAlign: 'center', fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 320 }}>{c.body}</Muted>
      <View style={styles.pips}>{cards.map((_, k) => <View key={k} style={[styles.pip, k === step && styles.pipOn]} />)}</View>
      <Button label={step < 2 ? 'Next' : 'Let\'s go'} onPress={() => { play('tap', 0.6); step < 2 ? setStep(step + 1) : onDone(); }} style={{ alignSelf: 'stretch', marginTop: 24 }} />
      <Button kind="quiet" label="Skip" onPress={onDone} style={{ alignSelf: 'stretch', marginTop: 8 }} />
    </View>
  );
}

const GENDERS: [string, string][] = [['woman', 'Woman'], ['man', 'Man'], ['non_binary', 'Non-binary']];
const SHOW: [string, string, string[]][] = [['women', 'Women', ['woman']], ['men', 'Men', ['man']], ['everyone', 'Everyone', ['woman', 'man', 'non_binary']]];
export const SAMPLE_PALETTES: [string, string][] = [['#FF6B5E', '#5B3FD6'], ['#C2409B', '#1B1530'], ['#EADBC2', '#C2409B'], ['#3F6FB5', '#C2409B'], ['#D9B26A', '#7A3B22']];
const SAMPLE_ANSWERS = [
  'I can name any Beatles song in three notes.', 'Bring snacks and laugh at my bad puns.', 'Long run, longer brunch, a nap I didn\'t plan.',
  'The time I met Jarvis Cocker in a chip shop.', 'The one who always books the restaurant.',
];
export const ME_LOOK = { hairColour: 'brunette', hairLength: 'medium', eyeColour: 'hazel', build: 'average' } as const;
type Step = 'you' | 'booth' | 'media' | 'stories' | 'verify';

/** Four quick steps: you, your 5 photos + talking video, your 5 stories, then a selfie check. */
export function QuickSetup({ onDone }: { onDone: () => void }) {
  const real = quick.mode === 'supabase';
  const steps: Step[] = ['you', 'booth', 'media', 'stories', 'verify'];
  const [step, setStep] = useState<Step>(steps[0]);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState('woman');
  const [show, setShow] = useState('men');
  const [photos, setPhotos] = useState<QMedia[]>([]);
  const [video, setVideo] = useState<QMedia | null>(null);
  const [stories, setStories] = useState(() => STORY_PROMPTS.slice(0, QD.stories).map((prompt) => ({ prompt, answer: '' })));
  const [miles, setMiles] = useState<number>(25);
  const [place, setPlace] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [booth, setBooth] = useState<QMedia[]>([]);
  const [verify, setVerify] = useState<'idle' | 'selfie' | 'checking' | 'done'>('idle');
  const [waiting, setWaiting] = useState(false);   // back from the check, but no result from the server yet
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const at = steps.indexOf(step);
  const go = (s: Step) => { setError(null); play('tap', 0.5); setStep(s); };

  const pick = async (kind: 'photo' | 'video') => {
    setError(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setError('Allow photo access in Settings to add yours.');
    }
    const room = kind === 'video' ? 1 : QD.photos - photos.length;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind === 'video' ? 'videos' : 'images'], quality: 0.85, videoMaxDuration: 30, allowsMultipleSelection: kind === 'photo', selectionLimit: room });
    if (r.canceled) return;
    const picked = r.assets.slice(0, room);
    if (real) {
      setBusy(true);
      try { for (const a of picked) await api.uploadMedia({ uri: a.uri, mimeType: a.mimeType, kind }, kind === 'video' ? 'intro' : undefined); }
      catch (e: any) { setError(String(e?.message ?? e)); setBusy(false); return; } finally { setBusy(false); }
    }
    const items = picked.map((a, k) => ({ id: `mine-${kind}-${photos.length + k}`, kind, url: kind === 'photo' ? a.uri : null, palette: SAMPLE_PALETTES[(photos.length + k) % 5], caption: kind === 'video' ? 'Say hello' : undefined }));
    if (kind === 'video') setVideo(items[0]); else setPhotos((p) => [...p, ...items]);
  };
  const samples = () => {
    setPhotos(SAMPLE_PALETTES.map((pal, k) => ({ id: `sample${k}`, kind: 'photo', palette: pal, caption: 'Sample' })));
    setVideo({ id: 'sample-video', kind: 'video', palette: SAMPLE_PALETTES[1], caption: 'Say hello' });
  };

  const parseDob = () => dobToIso(dob);
  const youReady = (real || (!!name.trim() && !!parseDob() && ageOn(parseDob()!) >= 18)) && !!place;
  const locate = async () => {
    setError(null); setLocating(true);
    try {
      if (!real) { await new Promise((r) => setTimeout(r, 600)); setPlace('Leeds'); return; }   // the demo pretends you're in Leeds
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setError('Quick Dial needs your rough location to show people nearby. It\'s rounded to about a kilometre.'); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await quick.setLocation(pos.coords.latitude, pos.coords.longitude);
      let name: string | null = null;
      try { const g = await Location.reverseGeocodeAsync(pos.coords); name = g[0]?.city ?? g[0]?.subregion ?? null; } catch { /* web has no reverse geocoding */ }
      setPlace(name ?? 'your area');
    } catch (e) { setError(friendly(e)); } finally { setLocating(false); }
  };
  const goFromYou = async () => { try { await quick.setMaxMiles(miles); } catch { /* saved again later */ } go('booth'); };
  const mediaReady = photos.length >= QD.photos && !!video;
  const storiesReady = stories.every((x) => x.answer.trim().length >= 2);

  const saveStories = async () => {
    setBusy(true); setError(null);
    try { await quick.saveStories(stories); go('verify'); } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };
  // Only the server can say someone is verified (the provider tells it directly), so after the
  // check we ask it, for up to about 12 seconds, rather than assuming it went well.
  const resultIn = async () => {
    for (let i = 0; i < 8; i++) {
      const s = await quick.getSettings().catch(() => null);
      if (s?.verified) return true;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  };
  const settle = async () => {
    setError(null); setVerify('checking'); play('lock', 0.6);
    const [ok] = await Promise.all([resultIn(), new Promise((r) => setTimeout(r, 1200))]);
    setWaiting(!ok);
    if (ok) { setVerify('done'); play('reward', 0.7); } else setVerify('idle');
  };
  const runVerify = async () => {
    setError(null); setVerify('selfie');
    try { await quick.verify(); await settle(); } catch (e) { setError(friendly(e)); setVerify('idle'); }
  };
  const finish = async () => {
    setBusy(true); setError(null);
    try {
      const all: QMedia[] = [...photos, ...(video ? [video] : []), ...stories.map((x, k) => ({ id: `story${k}`, kind: 'story' as const, prompt: x.prompt, answer: x.answer }))];
      await quick.saveProfile({ firstName: real ? 'me' : name, birthDate: real ? '2000-01-01' : parseDob()!, gender, showMe: SHOW.find(([k]) => k === show)![2], photos: all, booth, maxMiles: miles, place });
      play('reward', 0.7); onDone();
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };
  const swapPrompt = (k: number) => {
    const used = new Set(stories.map((x) => x.prompt));
    const pool = STORY_PROMPTS.filter((p) => !used.has(p));
    const next = pool[Math.floor(Math.random() * pool.length)] ?? stories[k].prompt;
    setStories(stories.map((x, j) => (j === k ? { ...x, prompt: next } : x)));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={styles.steps}>{steps.map((s, k) => <View key={s} style={[styles.stepBar, k <= at && styles.stepOn]} />)}</View>
      <Text style={styles.kicker}>Step {at + 1} of {steps.length} · {{ you: 'You', booth: 'Photobooth', media: 'Looks + vibe', stories: 'Personality', verify: 'Verify' }[step]}</Text>

      {step === 'you' && (
        <>
          <H1>{real ? 'Where are you?' : 'You, quickly'}</H1>
          {!real && <>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <View style={{ flex: 1.2 }}>
              <Text style={styles.label}>First name</Text>
              <TextInput value={name} onChangeText={setName} maxLength={40} style={styles.input} placeholder="Alex" placeholderTextColor={colours.slate} accessibilityLabel="First name" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Date of birth</Text>
              <DobInput value={dob} onChange={setDob} style={styles.input} />
            </View>
          </View>
          <Text style={styles.label}>I'm a</Text>
          <View style={styles.chips}>{GENDERS.map(([k, l]) => <Chip key={k} label={l} on={gender === k} onPress={() => setGender(k)} />)}</View>
          <Text style={styles.label}>Show me</Text>
          <View style={styles.chips}>{SHOW.map(([k, l]) => <Chip key={k} label={l} on={show === k} onPress={() => setShow(k)} />)}</View>
          </>}
          <Text style={styles.label}>Within</Text>
          <View style={styles.chips}>{DISTANCES.map((m) => <Chip key={m} label={`${m} miles`} on={miles === m} onPress={() => setMiles(m)} />)}</View>
          <Pressable onPress={locate} disabled={locating} style={[styles.videoSlot, { marginTop: 12 }, place && { borderColor: colours.accent, borderStyle: 'solid' }]}
            accessibilityRole="button" accessibilityLabel={place ? `Location set near ${place}` : 'Use my location'}>
            <Feather name={place ? 'check-circle' : 'map-pin'} size={20} color={place ? colours.accent : colours.slate} />
            <View style={{ flex: 1 }}>
              <Text style={styles.videoTitle}>{place ? `Near ${place}` : locating ? 'Finding you…' : 'Use my location'}</Text>
              <Muted style={styles.small}>Rounded to about a kilometre. People only ever see "3 mi", never where you are.</Muted>
            </View>
          </Pressable>
          <Button label="Next" onPress={goFromYou} disabled={!youReady} style={{ marginTop: 26 }} />
          {dob.length === 10 && !parseDob() && <Muted style={styles.small}>That date doesn't exist. Check the day and month.</Muted>}
          {!!parseDob() && ageOn(parseDob()!) < 18 && <Muted style={styles.small}>Quick Dial is for over-18s only.</Muted>}
        </>
      )}

      {step === 'booth' && (
        <Photobooth real={real} shots={booth} onShots={setBooth} onNext={async () => {
          if (real) {
            setBusy(true);
            try { await quick.saveBooth(booth.map((b) => b.url!).filter(Boolean)); } catch (e) { setError(friendly(e)); setBusy(false); return; }
            setBusy(false);
          }
          go('media');
        }} onBack={() => go('you')} busy={busy} />
      )}

      {step === 'media' && (
        <>
          <H1>Your 5 + a hello</H1>
          <Muted>Five photos for looks, one short talking video for vibe. Mix it up: a clear face, a full-length, something you love doing.</Muted>
          <Text style={styles.label}>Photos · {photos.length} of {QD.photos}</Text>
          <View style={styles.slots}>
            {Array.from({ length: QD.photos }, (_, k) => {
              const p = photos[k];
              return (
                <Pressable key={k} onPress={p ? () => setPhotos(photos.filter((_, j) => j !== k)) : () => pick('photo')} style={styles.slot}
                  accessibilityRole="button" accessibilityLabel={p ? `Remove photo ${k + 1}` : 'Add a photo'}>
                  {p ? <PersonCircle look={ME_LOOK} photo={p} size={58} glow /> : <View style={styles.empty}><Feather name="plus" size={20} color={colours.slate} /></View>}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>Talking video</Text>
          <Pressable onPress={video ? () => setVideo(null) : () => pick('video')} style={[styles.videoSlot, video && { borderColor: colours.accent, borderStyle: 'solid' }]}
            accessibilityRole="button" accessibilityLabel={video ? 'Remove your video' : 'Add a talking video'}>
            <Feather name={video ? 'check-circle' : 'video'} size={20} color={video ? colours.accent : colours.slate} />
            <View style={{ flex: 1 }}>
              <Text style={styles.videoTitle}>{video ? 'Video added' : 'Say hello to the camera'}</Text>
              <Muted style={styles.small}>{video ? 'Tap to change it' : '10 to 30 seconds. Say your name and one thing you\'re excited about.'}</Muted>
            </View>
          </Pressable>
          {!real && !mediaReady && <Button kind="quiet" label="Use sample photos and video (demo)" onPress={samples} style={{ marginTop: 12 }} />}
          <Button label={busy ? 'Uploading…' : 'Next'} onPress={() => go('stories')} disabled={!mediaReady || busy} style={{ marginTop: 18 }} />
          <Button kind="quiet" label="Back" onPress={() => go('booth')} style={{ marginTop: 8 }} />
        </>
      )}

      {step === 'stories' && (
        <>
          <H1>Your 5 stories</H1>
          <Muted>The personality half of your Dial, and it counts as much as your photos. Short and specific wins: a name, a place, a detail.</Muted>
          {stories.map((x, k) => (
            <View key={k} style={styles.story}>
              <Pressable onPress={() => swapPrompt(k)} style={styles.promptRow} accessibilityRole="button" accessibilityLabel={`Prompt: ${x.prompt}. Tap for a different one`}>
                <Text style={styles.prompt}>{x.prompt}</Text><Feather name="refresh-cw" size={12} color={colours.slate} />
              </Pressable>
              <TextInput value={x.answer} onChangeText={(t) => setStories(stories.map((y, j) => (j === k ? { ...y, answer: t } : y)))} maxLength={STORY_MAX}
                multiline style={styles.answer} placeholder="Your answer" placeholderTextColor={colours.slate} accessibilityLabel={`Answer: ${x.prompt}`} />
              <Text style={styles.count}>{x.answer.length}/{STORY_MAX}</Text>
            </View>
          ))}
          {!real && !storiesReady && <Button kind="quiet" label="Use sample answers (demo)" onPress={() => setStories(stories.map((x, k) => ({ ...x, answer: SAMPLE_ANSWERS[k] })))} style={{ marginTop: 12 }} />}
          <Button label={busy ? 'Saving…' : 'Next'} onPress={saveStories} disabled={!storiesReady || busy} style={{ marginTop: 18 }} />
          <Button kind="quiet" label="Back" onPress={() => go('media')} style={{ marginTop: 8 }} />
        </>
      )}

      {step === 'verify' && (
        <View style={{ alignItems: 'center' }}>
          <H1>Prove you're you</H1>
          <Muted style={{ textAlign: 'center' }}>A quick check with Yoti confirms you're over 18, with a selfie, your ID or the Yoti app. Everyone on Quick Dial is checked, so everyone you see is too.</Muted>
          <View style={styles.selfie}>
            {verify === 'idle' && <Feather name="camera" size={44} color={colours.slate} />}
            {verify === 'selfie' && <><Feather name="aperture" size={44} color={colours.accent} /><Text style={styles.selfieText}>Look at the camera, then slowly turn your head…</Text></>}
            {verify === 'checking' && <><Feather name="shield" size={44} color={colours.foil} /><Text style={styles.selfieText}>Checking your photos and stories…</Text></>}
            {verify === 'done' && <><Feather name="check-circle" size={52} color="#7FD6FF" /><Text style={styles.selfieText}>Verified. Photos and stories look good.</Text></>}
          </View>
          {verify === 'idle' && waiting && <>
            <Muted style={{ textAlign: 'center', marginBottom: 10 }}>We haven't had your result yet. If you finished the check, tap Check again in a moment. If it didn't work, you can start it again.</Muted>
            <Button label="Check again" onPress={settle} style={{ alignSelf: 'stretch', marginBottom: 8 }} />
          </>}
          {verify === 'idle' && <Button kind={waiting ? 'quiet' : 'primary'} label={waiting ? 'Start the check again' : 'Start selfie check'} onPress={runVerify} style={{ alignSelf: 'stretch' }} />}
          {verify === 'done' && <Button label={busy ? 'One sec…' : 'Start dialling'} onPress={finish} disabled={busy} style={{ alignSelf: 'stretch' }} />}
          <Muted style={[styles.small, { textAlign: 'center', marginTop: 12 }]}>
            {real ? 'Yoti runs the check and deletes selfies used to estimate age straight afterwards. We only get the result, never your selfie or ID.' : 'Demo: this simulates the check. The real app uses a certified provider for selfie and age checks.'}
          </Muted>
          {verify === 'idle' && <Button kind="quiet" label="Back" onPress={() => go('stories')} style={{ alignSelf: 'stretch', marginTop: 8 }} />}
        </View>
      )}
      {!!error && <Text style={{ color: colours.danger, marginTop: 12 }}>{error}</Text>}
    </ScrollView>
  );
}

export const BOOTH_POSES = ['tilt-left', 'straight', 'tilt-right'];
const BOOTH_CUES = ['Big smile', 'Now a serious one', 'Do something silly'];

/** Three selfies, photobooth style: 3-2-1, flash, next. They rotate in your circle on the deck. */
export function Photobooth({ real, shots, onShots, onNext, onBack, busy }:
  { real: boolean; shots: QMedia[]; onShots: (s: QMedia[]) => void; onNext: () => void; onBack: () => void; busy: boolean }) {
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [count, setCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const flash = useRef(new Animated.Value(0)).current;
  const size = 230;

  const run = async () => {
    if (real && !perm?.granted) { const p = await requestPerm(); if (!p.granted) return; }
    setRunning(true); onShots([]);
    const taken: QMedia[] = [];
    for (let k = 0; k < QD.booth; k++) {
      for (const n of [3, 2, 1]) { setCount(n); play('tap', 0.4); await new Promise((r) => setTimeout(r, 650)); }
      setCount(null);
      play('lock', 0.8);
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 60, useNativeDriver: nativeDriver }),
        Animated.timing(flash, { toValue: 0, duration: 380, useNativeDriver: nativeDriver }),
      ]).start();
      let url: string | null = null;
      if (real) { try { url = (await cam.current?.takePictureAsync({ quality: 0.7 }))?.uri ?? null; } catch { url = null; } }
      taken.push({ id: `booth${k}`, kind: 'photo', url, palette: SAMPLE_PALETTES[(k * 2) % 5], caption: BOOTH_POSES[k] });
      onShots([...taken]);
      await new Promise((r) => setTimeout(r, 500));
    }
    setRunning(false); play('reward', 0.6);
  };
  const cue = running ? BOOTH_CUES[Math.min(shots.length, QD.booth - 1)] : shots.length === QD.booth ? 'Lookin\' good' : 'Three quick selfies';

  return (
    <View style={{ alignItems: 'center' }}>
      <H1>Photobooth</H1>
      <Muted style={{ textAlign: 'center' }}>Three quick selfies. They rotate in your circle, so people see the real you before they tap in.</Muted>
      <View style={[styles.booth, { width: size, height: size, borderRadius: size / 2 }]}>
        {real && perm?.granted
          ? <CameraView ref={cam} facing="front" style={{ width: size, height: size }} />
          : <PersonCircle look={ME_LOOK} size={size} glow frames={shots.length && !running ? shots : undefined}
              photo={running ? { id: 'live', kind: 'photo', palette: SAMPLE_PALETTES[(shots.length * 2) % 5], caption: BOOTH_POSES[Math.min(shots.length, 2)] } : undefined} />}
        {count != null && <View style={styles.countWrap} pointerEvents="none"><Text style={styles.count3}>{count}</Text></View>}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', opacity: flash, borderRadius: size / 2 }]} />
      </View>
      <Text style={styles.cue}>{cue}</Text>
      <View style={styles.strip}>
        {Array.from({ length: QD.booth }, (_, k) => (
          <View key={k} style={styles.stripCell}>
            {shots[k] ? <PersonCircle look={ME_LOOK} photo={shots[k]} size={64} /> : <View style={[styles.empty, { width: 64, height: 64, borderRadius: 32 }]}><Text style={styles.stripN}>{k + 1}</Text></View>}
          </View>
        ))}
      </View>
      {shots.length < QD.booth || running
        ? <Button label={running ? 'Smile!' : 'Take my 3'} onPress={run} disabled={running} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        : <>
            <Button label={busy ? 'Saving…' : 'Next'} onPress={onNext} disabled={busy} style={{ alignSelf: 'stretch', marginTop: 18 }} />
            <Button kind="quiet" label="Retake" onPress={run} style={{ alignSelf: 'stretch', marginTop: 8 }} />
          </>}
      {!running && <Button kind="quiet" label="Back" onPress={onBack} style={{ alignSelf: 'stretch', marginTop: 8 }} />}
      {!real && <Muted style={[styles.small, { textAlign: 'center', marginTop: 10 }]}>Demo: the real app uses your front camera here.</Muted>}
    </View>
  );
}

export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <Text style={[styles.chipText, on && { color: colours.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { color: colours.text, fontFamily: serif, fontSize: 52, marginTop: 18, letterSpacing: 0.5 },
  slogan: { color: colours.foil, fontSize: 12, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 },
  cardTitle: { color: colours.text, fontFamily: serif, fontSize: 34, textAlign: 'center', marginTop: 18 },
  spark: { color: colours.foil, fontSize: 28, marginHorizontal: 2 },
  pips: { flexDirection: 'row', gap: 6, marginTop: 22 },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: colours.line },
  pipOn: { width: 22, backgroundColor: colours.accent },
  kicker: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 6 },
  label: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colours.line, paddingHorizontal: 16, paddingVertical: 9 },
  chipOn: { borderColor: colours.accent, backgroundColor: colours.accentTint },
  chipText: { color: colours.slate, fontSize: 14 },
  slots: { flexDirection: 'row', justifyContent: 'space-between' },
  steps: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  stepBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colours.line },
  stepOn: { backgroundColor: colours.accent },
  small: { fontSize: 12, lineHeight: 17 },
  videoSlot: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colours.slate },
  videoTitle: { color: colours.text, fontSize: 15, fontWeight: '600' },
  story: { marginTop: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  prompt: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', flex: 1 },
  answer: { color: colours.text, fontFamily: serif, fontSize: 19, lineHeight: 25, minHeight: 50, textAlignVertical: 'top', padding: 0 },
  count: { color: colours.slate, fontSize: 10, textAlign: 'right' },
  booth: { overflow: 'hidden', borderWidth: 2, borderColor: colours.foil, marginTop: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colours.surfaceRaised },
  countWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(8,7,15,0.25)' },
  count3: { color: '#fff', fontFamily: serif, fontSize: 96, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 12 },
  cue: { color: colours.foil, fontSize: 12, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', marginTop: 14 },
  strip: { flexDirection: 'row', gap: 12, marginTop: 14, padding: 10, borderRadius: 20, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  stripCell: { width: 64, height: 64 },
  stripN: { color: colours.slate, fontFamily: serif, fontSize: 20 },
  selfie: { width: 200, height: 200, borderRadius: 100, borderWidth: 2, borderColor: colours.line, alignItems: 'center', justifyContent: 'center', marginVertical: 26, padding: 22, gap: 10 },
  selfieText: { color: colours.text, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  slot: { width: 58, height: 58 },
  empty: { width: 58, height: 58, borderRadius: 29, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colours.slate, alignItems: 'center', justifyContent: 'center' },
}));
