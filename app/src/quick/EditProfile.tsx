// Edit your Quick profile: photobooth selfies, 5 photos, talking video, 5 stories and distance.
// Your Dial points at what to change: your best and lowest-scoring photo or story are marked.
// Anything you change is checked again before others see it, and starts collecting fresh Dials.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Feather from '@expo/vector-icons/Feather';
import { api } from '../api';
import { Button, Card, H1, Muted } from '../components/ui';
import { play } from '../sound';
import { colours, radius, serif, themed } from '../theme';
import { quick, type QProfile } from './api';
import { DISTANCES, QD, STORY_MAX, STORY_PROMPTS, friendly, hasDial, type QMedia } from './core';
import { Chip, ME_LOOK, Photobooth, SAMPLE_PALETTES } from './Onboarding';
import { useQuick } from './useQuick';
import { PersonCircle } from './Visual';

export function EditProfile({ onBack }: { onBack: () => void }) {
  const { data: loaded } = useQuick(() => quick.getProfile());
  const { data: dial } = useQuick(() => quick.getMyDial());
  const real = quick.mode === 'supabase';
  const [p, setP] = useState<QProfile | null>(null);
  const [booth, setBooth] = useState(false);
  const [miles, setMiles] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (loaded && !p) { setP(loaded); setMiles(loaded.maxMiles ?? 25); } }, [loaded]);
  if (!p) return null;

  const best = dial && hasDial(dial) ? dial.bestItem : null;
  const worst = dial && hasDial(dial) ? dial.worstItem : null;
  const photos = p.photos.filter((m) => m.kind === 'photo');
  const video = p.photos.find((m) => m.kind === 'video');
  const stories = p.photos.filter((m) => m.kind === 'story');
  const update = (items: QMedia[]) => { setSaved(false); setP({ ...p, photos: items }); };
  const replaceItem = (old: QMedia, next: QMedia) => update(p.photos.map((m) => (m.id === old.id ? next : m)));

  /** Pick a new photo or video to replace one (or fill an empty slot). Uploads straight away in the real app. */
  const pick = async (kind: 'photo' | 'video', old?: QMedia) => {
    setError(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return setError('Allow photo access in Settings to change these.');
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: [kind === 'video' ? 'videos' : 'images'], quality: 0.85, videoMaxDuration: 30 });
    if (r.canceled) return;
    const a = r.assets[0];
    if (real) {
      setBusy(true);
      try {
        if (old && kind === 'photo') await api.deleteMedia(old.id);
        await api.uploadMedia({ uri: a.uri, mimeType: a.mimeType, kind }, kind === 'video' ? 'intro' : undefined);
      } catch (e) { setError(friendly(e)); return; } finally { setBusy(false); }
    }
    const fresh: QMedia = { id: `new-${kind}-${Date.now()}`, kind, url: kind === 'photo' ? a.uri : null, palette: SAMPLE_PALETTES[Math.floor(Math.random() * 5)], caption: kind === 'video' ? 'Say hello' : 'New' };
    old ? replaceItem(old, fresh) : update([...p.photos, fresh]);
    play('lock', 0.5);
  };
  /** Demo: swap in a fresh sample instead of picking a file. */
  const sample = (old: QMedia) => replaceItem(old, { ...old, id: `new-${old.kind}-${Date.now()}`, palette: SAMPLE_PALETTES[Math.floor(Math.random() * 5)], caption: 'New' });

  const setStory = (old: QMedia, patch: Partial<QMedia>) => replaceItem(old, { ...old, ...patch, id: old.id.startsWith('edited-') ? old.id : `edited-${old.id}` });
  const swapPrompt = (old: QMedia) => {
    const used = new Set(stories.map((x) => x.prompt));
    const pool = STORY_PROMPTS.filter((x) => !used.has(x));
    setStory(old, { prompt: pool[Math.floor(Math.random() * pool.length)] ?? old.prompt });
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (stories.some((x) => (x.answer ?? '').trim().length < 2)) throw new Error('Every story needs an answer');
      await quick.saveStories(stories.map((x) => ({ prompt: x.prompt!, answer: x.answer! })));
      await quick.setMaxMiles(miles);
      if (!real) await quick.saveProfile({ ...p, maxMiles: miles });
      setSaved(true); play('reward', 0.6);
    } catch (e) { setError(friendly(e)); } finally { setBusy(false); }
  };

  if (booth) return (
    <ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 48 }}>
      <Photobooth real={real} shots={p.booth ?? []} onShots={(b) => setP({ ...p, booth: b })} busy={busy} onBack={() => setBooth(false)}
        onNext={async () => {
          if (real) { setBusy(true); try { await quick.saveBooth((p.booth ?? []).map((b) => b.url!).filter(Boolean)); } catch (e) { setError(friendly(e)); } finally { setBusy(false); } }
          setSaved(false); setBooth(false);
        }} />
    </ScrollView>
  );

  const Badge = ({ item }: { item: QMedia }) =>
    item.id === best ? <Text style={[styles.badge, styles.badgeBest]}>Your best</Text>
    : item.id === worst ? <Text style={[styles.badge, styles.badgeLow]}>Lowest · swap it?</Text> : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={styles.back}><Feather name="chevron-left" size={14} color={colours.slate} /> You</Text></Pressable>
      <H1>Edit profile</H1>
      <Muted>Swap what's not working and your Dial can climb. Changes are checked before anyone sees them, then start collecting fresh Dials.</Muted>

      <Text style={styles.section}>Photobooth</Text>
      <Card style={styles.row}>
        <PersonCircle look={ME_LOOK} frames={p.booth} size={64} glow />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Your three selfies</Text>
          <Muted style={styles.small}>They rotate in your circle. Fresh ones get more taps.</Muted>
        </View>
        <Button kind="quiet" label="Retake" onPress={() => setBooth(true)} style={styles.smallBtn} />
      </Card>

      <Text style={styles.section}>Photos · looks</Text>
      {photos.map((m, k) => (
        <Card key={m.id} style={[styles.row, { marginTop: k ? 8 : 0 }] as any}>
          <PersonCircle look={ME_LOOK} photo={m} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.rowTitle}>Photo {k + 1}</Text>
            <Badge item={m} />
          </View>
          <Button kind="quiet" label="Replace" onPress={() => (real ? pick('photo', m) : sample(m))} style={styles.smallBtn} />
        </Card>
      ))}
      {photos.length < QD.photos && <Button kind="quiet" label="Add a photo" onPress={() => pick('photo')} style={{ marginTop: 8 }} />}

      <Text style={styles.section}>Talking video · vibe</Text>
      <Card style={styles.row}>
        <Feather name="video" size={22} color={colours.accent} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.rowTitle}>{video ? 'Your hello' : 'No video yet'}</Text>
          {video ? <Badge item={video} /> : null}
          <Muted style={styles.small}>Daylight, close to the camera, one thing you're excited about.</Muted>
        </View>
        <Button kind="quiet" label={video ? 'Re-record' : 'Add'} onPress={() => (real || !video ? pick('video', video) : sample(video))} style={styles.smallBtn} />
      </Card>

      <Text style={styles.section}>Stories · personality</Text>
      {stories.map((x) => (
        <View key={x.id} style={styles.story}>
          <Pressable onPress={() => swapPrompt(x)} style={styles.promptRow} accessibilityRole="button" accessibilityLabel={`Prompt: ${x.prompt}. Tap for a different one`}>
            <Text style={styles.prompt}>{x.prompt}</Text><Feather name="refresh-cw" size={12} color={colours.slate} />
          </Pressable>
          <TextInput value={x.answer} onChangeText={(t) => setStory(x, { answer: t })} maxLength={STORY_MAX} multiline style={styles.answer}
            accessibilityLabel={`Answer: ${x.prompt}`} placeholder="Your answer" placeholderTextColor={colours.slate} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Badge item={x} /><Text style={styles.count}>{(x.answer ?? '').length}/{STORY_MAX}</Text>
          </View>
        </View>
      ))}

      <Text style={styles.section}>Distance</Text>
      <View style={styles.chips}>{DISTANCES.map((m) => <Chip key={m} label={`${m} miles`} on={miles === m} onPress={() => { setMiles(m); setSaved(false); }} />)}</View>

      {!!error && <Text style={{ color: colours.danger, marginTop: 14 }}>{error}</Text>}
      <Button label={busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'} onPress={save} disabled={busy || saved} style={{ marginTop: 22 }} />
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  back: { color: colours.slate, fontSize: 14, marginBottom: 12 },
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  rowTitle: { color: colours.text, fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  smallBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  badge: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  badgeBest: { color: '#08070F', backgroundColor: colours.foil },
  badgeLow: { color: colours.text, borderWidth: 1, borderColor: colours.accent },
  story: { marginTop: 8, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  prompt: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', flex: 1 },
  answer: { color: colours.text, fontFamily: serif, fontSize: 19, lineHeight: 25, minHeight: 44, textAlignVertical: 'top', padding: 0 },
  count: { color: colours.slate, fontSize: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));
