import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Me, type Person } from '../api';
import { compatibility } from '../core/compatibility';
import { highlights } from '../core/assessment';
import { idealScore, looksScore, overallScore, type LearnedRow } from '../core/looks';
import { describe } from '../components/Avatar';
import { MediaTile } from '../components/MediaTile';
import { DialCircle } from '../components/DialCircle';
import { ProfileDial } from '../components/ProfileDial';
import { SafetySheet } from '../components/SafetySheet';
import { Pressable } from 'react-native';
import { Button, Card, ChapterBadge, H1, Muted } from '../components/ui';
import { colours, radius, serif, themed } from '../theme';
import { useData } from '../useData';

type Column = 'overall' | 'looks' | 'personality' | 'ideal';
const COLUMNS: [Column, string][] = [['overall', 'Overall'], ['looks', 'Looks'], ['personality', 'Personality'], ['ideal', 'Ideal']];

/** The three matching columns for one person, plus the reasons behind each. */
export function scoresFor(me: Me, p: Person, learned: LearnedRow[]) {
  const compat = compatibility(me, p);
  const looks = p.look ? looksScore(p.look, me.idealTypes, learned) : { percent: null, rank: null, reason: null };
  const vibes = me.idealTypes.find((t) => t.rank === looks.rank)?.vibes ?? [];
  const ideal = idealScore(me.idealTraits, p.traits, p.fitsTheirIdeal, vibes);
  return { compat, looks, ideal, personality: compat.percent,
           overall: overallScore({ personality: compat.percent, ideal, looks: looks.percent }) };
}

export function Discover({ me, width, onMatched }: { me: Me; width: number; onMatched: (matchId: string) => void }) {
  const { data: learned } = useData(() => api.getLearnedType());
  const [column, setColumn] = useState<Column>('overall');
  const { data: people, error } = useData(() => api.getIntroductions());
  const [skipped, setSkipped] = useState<string[]>([]);
  const [gauging, setGauging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [safety, setSafety] = useState(false);

  if (error) return <Empty title="Something went wrong" body={error} />;
  if (!people) return <Empty title="Finding today's introductions" body="" />;
  const scored = people.filter((p) => !skipped.includes(p.id)).map((p) => ({ p, s: scoresFor(me, p, learned ?? []) }));
  const valueOf = (x: (typeof scored)[number]) => (column === 'personality' ? x.s.personality : column === 'looks' ? x.s.looks.percent : column === 'ideal' ? x.s.ideal : x.s.overall) ?? -1;
  scored.sort((a, b) => valueOf(b) - valueOf(a));
  const queue = scored.map((x) => x.p);
  const person: Person | undefined = queue[0];
  const columnEmpty = (column === 'looks' && !me.idealTypes.length && !(learned ?? []).length) || (column === 'ideal' && !Object.keys(me.idealTraits).length);
  const switcher = (
    <View style={styles.columns} accessibilityRole="tablist">
      {COLUMNS.map(([c, label]) => (
        <Button key={c} kind={column === c ? 'primary' : 'quiet'} label={label} onPress={() => setColumn(c)} style={styles.columnBtn} />
      ))}
    </View>
  );
  if (!person) return <Empty title="That's today's introductions" body="New people arrive tomorrow. In the meantime, your conversations are waiting." />;

  const { compat, looks, ideal, overall } = scored[0].s;
  const rate = (mediaId: string, score: number) => api.rateMedia(mediaId, score).catch((e) => setNotice(String(e?.message ?? e)));

  return (
    <ScrollView scrollEnabled={!gauging} contentContainerStyle={styles.page} key={person.id}>
      {switcher}
      {columnEmpty && <Muted style={styles.hint}>{column === 'looks' ? 'Set your top three looks or train your type in Profile › Your type to use this column.' : 'Answer the ideal partner questions in Profile › Your type to use this column.'}</Muted>}
      <Muted>{queue.length} of {people.length} introductions left today · sorted by {COLUMNS.find(([c]) => c === column)![1].toLowerCase()}</Muted>
      <View style={styles.header}>
        <Text style={styles.name}>{person.firstName}, {person.age}</Text>
        <ChapterBadge chapter={person.chapter} />
      </View>
      <Muted>{[person.occupation, person.city, person.distanceBand].filter(Boolean).join(' · ')}</Muted>

      <Card style={{ marginTop: 14 }}>
        <View style={styles.meters}>
          <Meter label="Overall" value={overall} on={column === 'overall'} />
          <Meter label="Looks" value={looks.percent} on={column === 'looks'} />
          <Meter label="Personality" value={compat.percent} on={column === 'personality'} />
          <Meter label="Ideal" value={ideal} on={column === 'ideal'} />
        </View>
        <Text style={styles.compatTitle}>Why they're here</Text>
        {looks.reason && <Text style={styles.reason}>• {looks.reason}</Text>}
        {ideal != null && ideal >= 70 && <Text style={styles.reason}>• Close to how you'd want a partner to be</Text>}
        {compat.reasons.map((r) => <Text key={r} style={styles.reason}>• {r}</Text>)}
        {person.look && <Muted style={{ marginTop: 6 }}>{describe(person.look)}</Muted>}
        <Muted style={{ fontSize: 12, marginTop: 8 }}>Playful insights, not a scientific assessment. Looks use only what people declare.</Muted>
      </Card>

      <View style={styles.chips}>
        {highlights(person.traits as Record<string, number>).map((h) => <View key={h} style={[styles.chip, styles.trait]}><Text style={styles.chipText}>{h}</Text></View>)}
      </View>

      {!!person.bio && <Text style={styles.bio}>“{person.bio}”</Text>}

      <View style={styles.circles}>
        {person.media.map((m, i) => (
          <View key={m.id} style={i === 0 ? styles.heroCircle : styles.gridCircle}>
            <DialCircle media={m} size={i === 0 ? Math.round(width * 0.84) : Math.round((width - 24) / 2)} score={m.myScore}
              onRate={(v) => rate(m.id, v)} onActiveChange={setGauging} />
          </View>
        ))}
      </View>
      <Muted style={styles.circleHint}>Tap or hold a photo to dial it, 1 to 100. Private: only the owner sees an average.</Muted>

      <View style={styles.chips}>
        {person.interests.map((i) => (
          <View key={i} style={[styles.chip, compat.shared.includes(i) && styles.chipShared]}>
            <Text style={styles.chipText}>{i}</Text>
          </View>
        ))}
      </View>

      {!!notice && <Text style={styles.notice}>{notice}</Text>}
      <View style={styles.dialSection}>
        <ProfileDial key={person.id} personId={person.id} name={person.firstName} photo={person.media.find((m) => m.kind === 'photo')}
          onDone={({ matchId }) => { if (matchId) onMatched(matchId); else setSkipped((x) => [...x, person.id]); }} />
        <Button kind="quiet" label="Skip for now" onPress={() => setSkipped([...skipped, person.id])} style={{ marginTop: 14, alignSelf: 'stretch' }} />
      </View>
      {safety
        ? <View style={{ marginHorizontal: -16 }}><SafetySheet person={person} onCancel={() => setSafety(false)} onDone={(blocked) => { setSafety(false); if (blocked) setSkipped((x) => [...x, person.id]); }} /></View>
        : <Pressable onPress={() => setSafety(true)} accessibilityRole="button" style={styles.reportLink} hitSlop={8}>
            <Text style={styles.reportText}>Report or block {person.firstName}</Text>
          </Pressable>}
    </ScrollView>
  );
}

function Meter({ label, value, on }: { label: string; value: number | null; on: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.meterValue, on && { color: colours.accent }]}>{value == null ? '–' : value}</Text>
      <Text numberOfLines={1} style={[styles.meterLabel, on && { color: colours.text }]}>{label}</Text>
      <View style={styles.meterTrack}><View style={[styles.meterFill, { width: `${value ?? 0}%`, opacity: on ? 1 : 0.45 }]} /></View>
    </View>
  );
}

const Empty = ({ title, body }: { title: string; body: string }) => (
  <View style={styles.empty}><H1>{title}</H1><Muted style={{ textAlign: 'center' }}>{body}</Muted></View>
);

const styles = themed(() => StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  name: { color: colours.text, fontFamily: serif, fontSize: 34 },
  compatRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  columns: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  columnBtn: { flex: 1, paddingVertical: 8, paddingHorizontal: 4 },
  hint: { marginBottom: 8, color: colours.accent },
  meters: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  meterValue: { color: colours.text, fontFamily: serif, fontSize: 26, fontVariant: ['lining-nums', 'tabular-nums'] },
  meterLabel: { color: colours.slate, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  meterTrack: { height: 3, borderRadius: 2, backgroundColor: colours.line, marginTop: 6, overflow: 'hidden' },
  meterFill: { height: 3, backgroundColor: colours.accent },
  percent: { color: colours.accent, fontFamily: serif, fontSize: 40, fontVariant: ['lining-nums', 'tabular-nums'] },
  compatTitle: { color: colours.text, fontWeight: '700', marginBottom: 4 },
  reason: { color: colours.text, opacity: 0.9, fontSize: 14, lineHeight: 20 },
  bio: { color: colours.text, fontFamily: serif, fontSize: 20, lineHeight: 28, marginTop: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colours.line, paddingHorizontal: 12, paddingVertical: 6 },
  chipShared: { borderColor: colours.accent, backgroundColor: colours.accentTint },
  chipText: { color: colours.text, fontSize: 13 },
  trait: { borderColor: colours.foil },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  notice: { color: colours.danger, marginTop: 12 },
  circles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 22, rowGap: 22 },
  heroCircle: { width: '100%', alignItems: 'center' },
  gridCircle: { width: '48%', alignItems: 'center' },
  circleHint: { textAlign: 'center', fontSize: 12, marginTop: 14 },
  dialSection: { marginTop: 28, paddingTop: 24, borderTopWidth: 1, borderTopColor: colours.line },
  input: { backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, minHeight: 64 },
  reportLink: { alignSelf: 'center', marginTop: 22, padding: 6 },
  reportText: { color: colours.slate, fontSize: 12, textDecorationLine: 'underline' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
}));
