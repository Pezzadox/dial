import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, type Me, type Media } from '../api';
import { highlights } from '../core/assessment';
import { ECONOMY } from '../core/economy';
import { STANDING_WEIGHTS } from '../core/standing';
import { MediaTile } from '../components/MediaTile';
import { Button, Card, ChapterBadge, H1, Muted } from '../components/ui';
import Feather from '@expo/vector-icons/Feather';
import { colours, radius, serif, setTheme, themeName, themed } from '../theme';
import { useData } from '../useData';
import { Assessment } from './Assessment';
import { setSoundOn, soundOn } from '../sound';
import { TypeHub } from './TypeHub';
import { AboutEditor } from './AboutEditor';
import { Moderation } from './Moderation';

const LABELS: Record<keyof typeof STANDING_WEIGHTS, string> = {
  communication: 'Communication', connection: 'Connection outcomes', dateExperience: 'Date experience', effort: 'Effort and profile quality',
  character: 'Personality, humour, creativity, curiosity', presentation: 'Presentation (the Dial)', community: 'Community behaviour', consistency: 'Consistency',
};
const ROLES = [['intro', 'Introduction', 'Talk to the camera: who you are, what a good Sunday looks like.'],
               ['personality', 'Personality', 'Something funny, creative or unusual about you.'],
               ['lifestyle', 'Lifestyle', 'What you love doing: sport, travel, a hobby.']] as const;
const MAX_VIDEO_SECONDS = 60;

export function Profile({ me, width, onReplayIntro }: { me: Me; width: number; onReplayIntro?: () => void }) {
  const { data: stats } = useData(() => api.getMyMediaStats());
  const [quiz, setQuiz] = useState(false);
  const [types, setTypes] = useState(false);
  const [about, setAbout] = useState(false);
  const [mod, setMod] = useState(false);
  const { data: staff } = useData(() => api.isStaff());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (quiz) return <Assessment onDone={() => setQuiz(false)} />;
  if (types) return <TypeHub me={me} width={width} onBack={() => setTypes(false)} />;
  if (about) return <AboutEditor me={me} onDone={() => setAbout(false)} />;
  if (mod) return <Moderation onBack={() => setMod(false)} />;

  const photos = me.media.filter((m) => m.kind === 'photo');
  const pick = async (kind: 'photo' | 'video', role?: 'intro' | 'personality' | 'lifestyle') => {
    setError(null);
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError('Allow photo access in Settings to add media.'); return; }
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: kind === 'photo' ? ['images'] : ['videos'], quality: 0.85, videoMaxDuration: MAX_VIDEO_SECONDS,
      allowsEditing: kind === 'photo', aspect: [4, 5],
    });
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    if (kind === 'video' && asset.duration && asset.duration / 1000 > MAX_VIDEO_SECONDS + 1) { setError(`Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`); return; }
    setBusy(true);
    try { await api.uploadMedia({ uri: asset.uri, mimeType: asset.mimeType, kind }, role); }
    catch (e: any) { setError(String(e?.message ?? e)); }
    finally { setBusy(false); }
  };
  const tags = highlights(me.traits as Record<string, number>);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <H1>{me.firstName}</H1>
      <ChapterBadge chapter={me.chapter} />
      <Muted style={{ marginTop: 8 }}>{[me.occupation, me.city].filter(Boolean).join(' · ')}</Muted>

      <Card style={{ marginTop: 18 }}>
        <Text style={styles.rowTitle}>About you</Text>
        {me.bio ? <Text style={styles.bio}>“{me.bio}”</Text> : <Muted>Add a line about you. Specific beats clever.</Muted>}
        <Muted style={{ fontSize: 12, marginTop: 6 }}>{[me.intentions && `Looking for ${me.intentions}`, me.interests.length ? me.interests.join(' · ') : null].filter(Boolean).join('  ·  ') || 'No interests yet'}</Muted>
        <Button kind="quiet" label="Edit about you" onPress={() => setAbout(true)} style={{ marginTop: 12 }} />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Text style={styles.rowTitle}>Your type</Text>
        <Muted>Ideal partner, your top three looks, and type training. {me.idealTypes.length} of 3 types set.</Muted>
        <Button label="Set up your type" onPress={() => setTypes(true)} style={{ marginTop: 12 }} />
      </Card>

      <Text style={styles.section}>Photos ({photos.length} of 10)</Text>
      <View style={styles.grid}>
        {photos.map((m) => <Thumb key={m.id} media={m} onDelete={() => api.deleteMedia(m.id)} />)}
        {photos.length < 10 && (
          <Pressable onPress={() => pick('photo')} style={[styles.thumb, styles.add]} accessibilityRole="button" accessibilityLabel="Add a photo" disabled={busy}>
            {busy ? <Text style={styles.plus}>…</Text> : <Feather name="plus" size={28} color={colours.text} />}
          </Pressable>
        )}
      </View>

      <Text style={styles.section}>Videos</Text>
      {ROLES.map(([role, title, help]) => {
        const v = me.media.find((m) => m.kind === 'video' && m.videoRole === role);
        return (
          <Card key={role} style={styles.videoRow}>
            <View style={styles.smallThumb}>{v && <MediaTile media={v} width={56} height={56} small />}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{title}{role === 'intro' ? ' · most viewed' : ''}</Text>
              <Muted style={{ fontSize: 12 }}>{v ? statusText(v) : help}</Muted>
            </View>
            <Button kind={v ? 'quiet' : 'primary'} label={v ? 'Replace' : 'Add'} onPress={() => pick('video', role)} disabled={busy} style={{ paddingVertical: 8 }} />
          </Card>
        );
      })}
      {!!error && <Text style={{ color: colours.danger, marginTop: 10 }}>{error}</Text>}

      <Text style={styles.section}>Personality</Text>
      <Card>
        {me.assessmentsDone.includes('personality') ? (
          <>
            <View style={styles.tags}>{tags.map((t) => <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>)}</View>
            <Button kind="quiet" label="Retake the personality game" onPress={() => setQuiz(true)} style={{ marginTop: 12 }} />
          </>
        ) : (
          <>
            <Text style={styles.rowTitle}>Eight quick questions, about two minutes</Text>
            <Muted>Helps us explain why you and someone might get on. Earns 100 Ink the first time.</Muted>
            <Button label="Play the personality game" onPress={() => setQuiz(true)} style={{ marginTop: 12 }} />
          </>
        )}
      </Card>

      <Text style={styles.section}>What the Dial says about your photos and videos</Text>
      <Muted>Only you can see this. An average appears once {ECONOMY.ratingMinRaters} different people have rated an item, and you never see who gave which score.</Muted>
      {me.media.map((m) => {
        const s = stats?.find((x) => x.mediaId === m.id);
        return (
          <Card key={m.id} style={styles.mediaRow}>
            <View style={styles.smallThumb}><MediaTile media={m} width={56} height={56} small /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{m.caption ?? (m.kind === 'video' ? 'Video' : 'Photo')}</Text>
              <Muted>{m.moderation === 'pending' ? 'Awaiting review' : s?.average != null ? `${s.raters} ratings` : `${s?.raters ?? 0} of ${ECONOMY.ratingMinRaters} ratings needed`}</Muted>
              <View style={styles.track}><View style={[styles.fill, { width: `${s?.average ?? 0}%` }]} /></View>
            </View>
            <Text style={styles.score}>{s?.average != null ? Math.round(s.average) : '–'}</Text>
          </Card>
        );
      })}

      <Text style={styles.section}>Appearance</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button kind={themeName() === 'ink' ? 'primary' : 'quiet'} label="Dark glow" onPress={() => setTheme('ink')} style={{ flex: 1 }} />
        <Button kind={themeName() === 'paper' ? 'primary' : 'quiet'} label="Light" onPress={() => setTheme('paper')} style={{ flex: 1 }} />
      </View>

      <Text style={styles.section}>AI reply ideas</Text>
      <AiSwitches />

      <Text style={styles.section}>Sound</Text>
      <SoundSwitch />
      {onReplayIntro && <Button kind="quiet" label="Replay the how-to-dial guide" onPress={onReplayIntro} style={{ marginTop: 12 }} />}

      <Text style={styles.section}>Safety</Text>
      <Blocked />
      {staff && (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
          <Feather name="shield" size={20} color={colours.foil} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Moderation console</Text>
            <Muted style={{ fontSize: 12 }}>{api.mode === 'demo' ? 'Staff only. Open in the demo so you can try it, including approving your own uploads.' : 'Staff only: reports and media review.'}</Muted>
          </View>
          <Button label="Open" onPress={() => setMod(true)} style={{ paddingVertical: 8 }} />
        </Card>
      )}

      <Text style={styles.section}>What your private Standing is made of</Text>
      <Card>
        {(Object.keys(STANDING_WEIGHTS) as (keyof typeof STANDING_WEIGHTS)[]).map((k) => (
          <View key={k} style={styles.weightRow}>
            <Text style={styles.rowText}>{LABELS[k]}</Text>
            <Text style={styles.weight}>{STANDING_WEIGHTS[k]}</Text>
          </View>
        ))}
        <Muted style={{ fontSize: 12, marginTop: 8 }}>Matches and likes received carry no weight.</Muted>
      </Card>
    </ScrollView>
  );
}

function AiSwitches() {
  const { data: ideas } = useData(() => api.getConsent('ai_coach'));
  const { data: content } = useData(() => api.getConsent('ai_coach_content'));
  const row = (title: string, help: string, value: boolean, onChange: (v: boolean) => void, label: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Muted style={{ fontSize: 12 }}>{help}</Muted></View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: colours.accent, false: colours.line }} />
    </View>
  );
  return (
    <Card style={{ padding: 14 }}>
      {row('Reply ideas in chats', 'Three suggested replies when you want them. You edit and send them yourself.', !!ideas, (v) => api.setConsent('ai_coach', v), 'Reply ideas in chats')}
      {row("Let my matches' ideas use my messages", 'Off by default. When on, the AI can read your messages to suggest better replies for the people you talk to. Never stored by the AI, never used for scores.', !!content, (v) => api.setConsent('ai_coach_content', v), 'Let AI use my messages')}
    </Card>
  );
}

function Blocked() {
  const { data: rows } = useData(() => api.getBlocked());
  return (
    <Card style={{ padding: 14 }}>
      <Text style={styles.rowTitle}>Blocked</Text>
      {!rows?.length
        ? <Muted style={{ fontSize: 12 }}>Nobody. Block or report anyone from their profile or the ⋯ menu in a chat. They're never told.</Muted>
        : rows.map((r) => (
          <View key={r.personId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <Text style={[styles.rowText, { flex: 1 }]}>{r.firstName}</Text>
            <Button kind="quiet" label="Unblock" onPress={() => api.unblockMember(r.personId)} style={{ paddingVertical: 6, paddingHorizontal: 12 }} />
          </View>
        ))}
    </Card>
  );
}

function SoundSwitch() {
  const [on, setOn] = useState(soundOn());
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>Sound effects</Text>
        <Muted style={{ fontSize: 12 }}>Clicks as the Dial turns, a chime for matches and Ink. Silent mode is always respected.</Muted>
      </View>
      <Switch value={on} onValueChange={(v) => { setSoundOn(v); setOn(v); }} accessibilityLabel="Sound effects" trackColor={{ true: colours.accent, false: colours.line }} />
    </Card>
  );
}

const statusText = (m: Media) => m.moderation === 'pending' ? (api.mode === 'demo' ? 'In review. Approve it in Moderation below' : 'Awaiting review before others can see it') : m.moderation === 'rejected' ? 'Not approved. Try another.' : 'Live on your profile';

function Thumb({ media, onDelete }: { media: Media; onDelete: () => void }) {
  return (
    <View style={styles.thumb}>
      <MediaTile media={media} width={THUMB} height={THUMB * 1.25} small />
      {media.moderation === 'pending' && <Text style={styles.pending}>In review</Text>}
      <Pressable onPress={onDelete} style={styles.remove} accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8}>
        <Feather name="x" size={13} color={colours.onMedia} />
      </Pressable>
    </View>
  );
}

const THUMB = 96;
const styles = themed(() => StyleSheet.create({
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 26, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: THUMB, height: THUMB * 1.25, borderRadius: 16, overflow: 'hidden', backgroundColor: colours.surface },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colours.slate },
  plus: { color: colours.text, fontSize: 32 },
  remove: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(14,11,26,0.7)', alignItems: 'center', justifyContent: 'center' },
  pending: { position: 'absolute', left: 6, bottom: 6, color: colours.onMedia, fontSize: 11, fontWeight: '700', backgroundColor: 'rgba(14,11,26,0.7)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, padding: 12 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10, padding: 12 },
  smallThumb: { width: 56, height: 56, borderRadius: radius.control, overflow: 'hidden', backgroundColor: colours.surfaceRaised },
  rowTitle: { color: colours.text, fontSize: 15, fontWeight: '600' },
  track: { height: 4, borderRadius: 2, backgroundColor: colours.line, marginTop: 8, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colours.accent },
  score: { color: colours.text, fontFamily: serif, fontSize: 30, width: 48, textAlign: 'right', fontVariant: ['lining-nums', 'tabular-nums'] },
  weightRow: { flexDirection: 'row', paddingVertical: 7, gap: 12 },
  rowText: { color: colours.text, fontSize: 14, flex: 1 },
  weight: { color: colours.slate, fontVariant: ['lining-nums', 'tabular-nums'] },
  bio: { color: colours.text, fontFamily: serif, fontSize: 19, lineHeight: 26, marginTop: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderRadius: 999, borderWidth: 1, borderColor: colours.accent, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colours.accentTint },
  tagText: { color: colours.text, fontSize: 14, fontWeight: '600' },
}));
