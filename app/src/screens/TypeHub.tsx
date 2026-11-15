// Everything that shapes who you're shown: your ideal partner, your top three types,
// type training, and your own declared look.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Me } from '../api';
import { Avatar, describe } from '../components/Avatar';
import { HeightSlider } from '../components/HeightSlider';
import { Button, Card, H1, Muted } from '../components/ui';
import { highlights } from '../core/assessment';
import { BUILD, EYES, HAIR, HAIR_LENGTH, learnedSummary, typeFromLearned, type IdealType, type Look } from '../core/looks';
import { colours, serif, themed } from '../theme';
import { useData } from '../useData';
import { Assessment } from './Assessment';
import { TypeBuilder } from './TypeBuilder';

type View_ = { kind: 'hub' } | { kind: 'ideal' } | { kind: 'type'; rank: 1 | 2 | 3 };

export function TypeHub({ me, width, onBack }: { me: Me; width: number; onBack: () => void }) {
  const [view, setView] = useState<View_>({ kind: 'hub' });
  const { data: learned } = useData(() => api.getLearnedType());
  const hub = () => setView({ kind: 'hub' });
  if (view.kind === 'ideal') return <Assessment ideal onDone={hub} />;
  if (view.kind === 'type') return <TypeBuilder rank={view.rank} initial={me.idealTypes.find((t) => t.rank === view.rank)} onDone={hub} />;

  const idealDone = me.assessmentsDone.includes('ideal_partner');
  const summary = learnedSummary(learned ?? []);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to profile"><Muted>‹ Profile</Muted></Pressable>
      <H1>Your type</H1>
      <Muted>Tell Dial who to show you. Everyone you dial teaches it too. On Discover you choose which column to sort by.</Muted>

      <Text style={styles.section}>1 · Your ideal partner</Text>
      <Card>
        <Text style={styles.title}>How would they behave?</Text>
        <Muted>The same eight scenarios as your own personality game, answered for the partner you'd wish for. Shared by all three of your types.</Muted>
        {idealDone && <View style={styles.tags}>{highlights(me.idealTraits as Record<string, number>).map((h) => <View key={h} style={styles.tag}><Text style={styles.tagText}>{h}</Text></View>)}</View>}
        <Button kind={idealDone ? 'quiet' : 'primary'} label={idealDone ? 'Retake' : 'Answer the eight questions'} onPress={() => setView({ kind: 'ideal' })} style={{ marginTop: 12 }} />
      </Card>

      <Text style={styles.section}>2 · Your top three looks</Text>
      <View style={styles.types}>
        {([1, 2, 3] as const).map((rank) => {
          const t = me.idealTypes.find((x) => x.rank === rank);
          return <TypeCard key={rank} rank={rank} type={t} width={(Math.min(width, 448) - 20) / 3} onPress={() => setView({ kind: 'type', rank })} />;
        })}
      </View>

      <Text style={styles.section}>3 · What your Dials say</Text>
      <Card>
        <Text style={styles.title}>Learned from everyone you dial</Text>
        <Muted>{summary.length ? `You dial higher for: ${summary.join(', ')}.` : 'Dial a few more people on Discover and a pattern will show here.'}</Muted>
        {summary.length > 0 && <Button kind="quiet" label="Use this as my #1 type" style={{ marginTop: 12 }}
          onPress={() => api.saveIdealType(typeFromLearned(learned ?? []))} />}
      </Card>

      <Text style={styles.section}>Your own look</Text>
      <MyLook look={me.look ?? {}} />
    </ScrollView>
  );
}

function TypeCard({ rank, type, width, onPress }: { rank: number; type?: IdealType; width: number; onPress: () => void }) {
  const look: Look = type ? { hairColour: type.hairColours[0], hairLength: type.hairLengths[0] ?? 'medium', eyeColour: type.eyeColours[0], build: type.builds[0] } : {};
  return (
    <Pressable onPress={onPress} style={[styles.typeCard, { width }]} accessibilityRole="button" accessibilityLabel={`Edit type ${rank}`}>
      <Text style={styles.rank}>#{rank}</Text>
      {type ? <Avatar look={look} size={width - 2} smile={type.vibes.some((v) => ['bubbly', 'playful', 'warm'].includes(v))} />
            : <View style={[styles.emptyType, { height: (width - 2) * 1.25 }]}><Text style={styles.plus}>+</Text></View>}
      <Text style={styles.typeText} numberOfLines={3}>{type ? [describe(look), type.vibes.join(', ')].filter(Boolean).join(' · ') : 'Add a type'}</Text>
    </Pressable>
  );
}

function MyLook({ look }: { look: Look }) {
  const [l, setL] = useState<Look>(look);
  const [height, setHeight] = useState<number | null>(look.heightCm ?? null);
  const [saved, setSaved] = useState(false);
  const pick = (key: keyof Look, v: string) => { setSaved(false); setL({ ...l, [key]: l[key] === v ? null : v }); };
  const save = () => {
    api.saveMyLook({ ...l, heightCm: height }).then(() => setSaved(true));
  };
  const row = (title: string, key: keyof Look, values: readonly string[]) => (
    <View style={{ marginTop: 12 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={styles.chips}>{values.map((v) => <Button key={v} kind={l[key] === v ? 'primary' : 'quiet'} label={v} onPress={() => pick(key, v)} style={styles.chip} />)}</View>
    </View>
  );
  return (
    <Card>
      <Muted>Optional. Shown on your profile and used to match you with people whose type you fit. Leave anything blank and you're treated as neutral, never as a miss.</Muted>
      {row('Hair colour', 'hairColour', HAIR)}
      {row('Hair length', 'hairLength', HAIR_LENGTH)}
      {row('Eyes', 'eyeColour', EYES)}
      {row('Build', 'build', BUILD)}
      <Text style={[styles.rowTitle, { marginTop: 12 }]}>Height</Text>
      {height == null
        ? <Button kind="quiet" label="Add my height" onPress={() => { setSaved(false); setHeight(170); }} style={styles.chip} />
        : <HeightSlider value={height} onChange={(cm) => { setSaved(false); setHeight(cm); }} />}
      <Button label={saved ? 'Saved' : 'Save my look'} onPress={save} style={{ marginTop: 12 }} />
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  title: { color: colours.text, fontWeight: '700', fontSize: 15, marginBottom: 4 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tag: { borderRadius: 999, borderWidth: 1, borderColor: colours.accent, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colours.accentTint },
  tagText: { color: colours.text, fontSize: 14, fontWeight: '600' },
  types: { flexDirection: 'row', gap: 10 },
  typeCard: { borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  rank: { position: 'absolute', zIndex: 2, top: 6, left: 8, color: colours.text, fontFamily: serif, fontSize: 18 },
  emptyType: { alignItems: 'center', justifyContent: 'center', backgroundColor: colours.surfaceRaised },
  plus: { color: colours.slate, fontSize: 30 },
  typeText: { color: colours.text, fontSize: 11, padding: 8, minHeight: 52 },
  rowTitle: { color: colours.text, fontWeight: '700', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12 },
}));
