// Moderation console for the safety team: reports first (most serious at the top), then media waiting for review.
// The server refuses every call here unless the signed-in member is listed as staff.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { api, type ModReport } from '../api';
import { MediaTile } from '../components/MediaTile';
import { reasonLabel } from '../components/SafetySheet';
import { Button, Card, H1, Muted } from '../components/ui';
import { colours, radius, serif, themed } from '../theme';
import { useData } from '../useData';

const SEVERE = ['underage', 'felt_unsafe', 'felt_unsafe_on_date', 'harassment'];

export function Moderation({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'reports' | 'media'>('reports');
  const { data: reports } = useData(() => api.getModReports());
  const { data: media } = useData(() => api.getModMedia());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const act = (p: Promise<unknown>, note: string) => p.then(() => { setError(null); setDone(note); }).catch((e) => setError(String(e?.message ?? e)));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={styles.back}><Feather name="chevron-left" size={14} color={colours.slate} /> Profile</Text></Pressable>
      <Text style={styles.kicker}>Staff only</Text>
      <H1>Moderation</H1>
      <Muted>Every decision is logged. Reporters are never revealed to the person reported.</Muted>

      <View style={styles.tabs}>
        <Button kind={tab === 'reports' ? 'primary' : 'quiet'} label={`Reports · ${reports?.length ?? 0}`} onPress={() => setTab('reports')} style={{ flex: 1 }} />
        <Button kind={tab === 'media' ? 'primary' : 'quiet'} label={`Photos & videos · ${media?.length ?? 0}`} onPress={() => setTab('media')} style={{ flex: 1 }} />
      </View>
      {!!done && <Text style={styles.done}>✓ {done}</Text>}
      {!!error && <Text style={{ color: colours.danger, marginBottom: 8 }}>{error}</Text>}

      {tab === 'reports' && (reports?.length === 0
        ? <Muted style={{ marginTop: 16, textAlign: 'center' }}>No open reports. Nice.</Muted>
        : (reports ?? []).map((r) => <ReportCard key={r.id} r={r} act={act} />))}

      {tab === 'media' && (media?.length === 0
        ? <Muted style={{ marginTop: 16, textAlign: 'center' }}>Nothing waiting for review.</Muted>
        : (media ?? []).map((m) => (
          <Card key={m.id} style={styles.mediaCard}>
            <View style={styles.mediaThumb}><MediaTile media={m.media} width={92} height={115} small /></View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.name}>{m.ownerName}</Text>
              <Muted style={{ fontSize: 12 }}>{m.media.kind === 'video' ? `Video · ${m.media.videoRole}` : 'Photo'}{m.media.caption ? ` · ${m.media.caption}` : ''}</Muted>
              <Muted style={{ fontSize: 12 }}>Check: a real person, no nudity, no children alone, no contact details or payment links.</Muted>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Button label="Approve" onPress={() => act(api.reviewMedia(m.id, true), `Approved ${m.ownerName}'s ${m.media.kind}`)} style={styles.small} />
                <Button kind="quiet" label="Reject" onPress={() => act(api.reviewMedia(m.id, false), `Rejected ${m.ownerName}'s ${m.media.kind}`)} style={styles.small} />
              </View>
            </View>
          </Card>
        )))}
    </ScrollView>
  );
}

function ReportCard({ r, act }: { r: ModReport; act: (p: Promise<unknown>, note: string) => void }) {
  const severe = SEVERE.includes(r.reason);
  return (
    <Card style={severe ? { ...styles.report, borderColor: colours.danger } : styles.report}>
      <View style={styles.reportHead}>
        <Text style={styles.name}>{r.firstName}</Text>
        {severe && <Text style={styles.urgent}>Priority</Text>}
        {r.status === 'reviewing' && <Text style={styles.reviewing}>In review</Text>}
      </View>
      <Text style={styles.reason}>{reasonLabel(r.reason)}</Text>
      {!!r.detail && <Text style={styles.detail}>“{r.detail}”</Text>}
      <Muted style={{ fontSize: 12, marginTop: 6 }}>{r.reportsAgainst} report{r.reportsAgainst === 1 ? '' : 's'} from {r.reporters} {r.reporters === 1 ? 'person' : 'different people'}</Muted>
      <View style={styles.actions}>
        <Button kind="quiet" label="Dismiss" onPress={() => act(api.resolveReport(r.id, 'dismissed'), `Dismissed the report about ${r.firstName}`)} style={styles.small} />
        {r.status === 'open' && <Button kind="quiet" label="Investigate" onPress={() => act(api.resolveReport(r.id, 'reviewing'), `${r.firstName}'s report is in review`)} style={styles.small} />}
        <Button label="Suspend 7 days" onPress={() => act(api.resolveReport(r.id, 'upheld', 7), `${r.firstName} is suspended for 7 days`)} style={styles.small} />
        <Button label="Remove from Dial" onPress={() => act(api.resolveReport(r.id, 'upheld', 3650), `${r.firstName} has been removed`)} style={{ ...styles.small, backgroundColor: colours.danger }} />
      </View>
    </Card>
  );
}

const styles = themed(() => StyleSheet.create({
  back: { color: colours.slate, fontSize: 14, marginBottom: 12 },
  kicker: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 6 },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16, marginBottom: 12 },
  done: { color: colours.foil, marginBottom: 8 },
  report: { marginTop: 10, padding: 16 },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: colours.text, fontFamily: serif, fontSize: 22 },
  urgent: { color: colours.danger, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', borderWidth: 1, borderColor: colours.danger, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  reviewing: { color: colours.foil, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  reason: { color: colours.text, fontWeight: '600', marginTop: 4 },
  detail: { color: colours.text, opacity: 0.85, fontSize: 14, lineHeight: 20, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  small: { paddingVertical: 8, paddingHorizontal: 12 },
  mediaCard: { flexDirection: 'row', gap: 14, marginTop: 10, padding: 12 },
  mediaThumb: { width: 92, height: 115, borderRadius: radius.control, overflow: 'hidden', backgroundColor: colours.surfaceRaised },
}));
