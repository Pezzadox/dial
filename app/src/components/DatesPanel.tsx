// Plan a date inside a conversation, confirm it happened, then give private feedback.
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type DateFeedback, type DatePlan } from '../api';
import { Button, Muted } from './ui';
import { colours, radius, serif, themed } from '../theme';
import { useData } from '../useData';

const VENUE_IDEAS = ['Coffee at', 'Drinks at', 'A walk around', 'Gallery visit:'];
const TIMES = [['12:30', 12, 30], ['15:00', 15, 0], ['18:30', 18, 30], ['19:30', 19, 30]] as const;
const QUESTIONS: [keyof DateFeedback, string][] = [
  ['enjoyed', 'Did you enjoy meeting them?'],
  ['conversation', 'Was the conversation as good in person as online?'],
  ['comfortable', 'Did they make you feel comfortable?'],
  ['matchedProfile', 'Did they match their profile?'],
  ['seeAgain', 'Would you like to see them again?'],
];

const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function DatesPanel({ matchId, name, planning, initialVenue, onClosePlanner }: { matchId: string; name: string; planning: boolean; initialVenue?: string; onClosePlanner: () => void }) {
  const { data: plans } = useData(() => api.getDatePlans(matchId), [matchId]);
  const [error, setError] = useState<string | null>(null);
  const run = (p: Promise<unknown>) => p.then(() => setError(null)).catch((e) => setError(String(e?.message ?? e)));
  const live = (plans ?? []).filter((p) => !['declined', 'cancelled'].includes(p.status) && !(p.status === 'confirmed' && p.myFeedbackGiven && Date.now() - new Date(p.startsAt).getTime() > 7 * 864e5));
  return (
    <View>
      {planning && <Planner key={initialVenue ?? 'blank'} initialVenue={initialVenue} name={name} onCancel={onClosePlanner} onPropose={(venue, at) => run(api.proposeDate(matchId, venue, at).then(onClosePlanner))} />}
      {live.map((p) => <PlanCard key={p.id} plan={p} name={name} run={run} />)}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function Planner({ name, initialVenue, onPropose, onCancel }: { name: string; initialVenue?: string; onPropose: (venue: string, at: Date) => void; onCancel: () => void }) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); return d; });
  const [venue, setVenue] = useState(initialVenue ?? '');
  const [day, setDay] = useState(0);
  const [time, setTime] = useState(3);
  const at = new Date(days[day]); at.setHours(TIMES[time][1], TIMES[time][2], 0, 0);
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Plan a date with {name}</Text>
      <Muted style={{ fontSize: 12 }}>Pick somewhere public. You can share the plan with a friend once it is accepted.</Muted>
      <View style={styles.chips}>{VENUE_IDEAS.map((v) => <Chip key={v} label={v} on={venue.startsWith(v)} onPress={() => setVenue(v + ' ')} />)}</View>
      <TextInput value={venue} onChangeText={setVenue} placeholder="Where? e.g. Coffee at North Star" placeholderTextColor={colours.slate} style={styles.input} accessibilityLabel="Where" />
      <View style={styles.chips}>{days.map((d, i) => <Chip key={i} label={d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} on={day === i} onPress={() => setDay(i)} />)}</View>
      <View style={styles.chips}>{TIMES.map((t, i) => <Chip key={t[0]} label={t[0]} on={time === i} onPress={() => setTime(i)} />)}</View>
      <View style={styles.row}>
        <Button kind="quiet" label="Cancel" onPress={onCancel} style={{ flex: 1 }} />
        <Button label="Send invitation" onPress={() => onPropose(venue, at)} disabled={venue.trim().length < 4} style={{ flex: 1 }} />
      </View>
    </View>
  );
}

function PlanCard({ plan: p, name, run }: { plan: DatePlan; name: string; run: (x: Promise<unknown>) => void }) {
  const past = new Date(p.startsAt).getTime() <= Date.now();
  let body: React.ReactNode;
  if (p.status === 'proposed' && p.proposedByMe) body = <Muted>Invitation sent. Waiting for {name}.</Muted>;
  else if (p.status === 'proposed') body = (
    <View style={styles.row}>
      <Button kind="quiet" label="Decline" onPress={() => run(api.respondToDate(p.id, false))} style={{ flex: 1 }} />
      <Button label="Accept" onPress={() => run(api.respondToDate(p.id, true))} style={{ flex: 1 }} />
    </View>);
  else if (p.status === 'held_for_review') body = <Muted>We're checking this date before any Ink is paid.</Muted>;
  else if (p.myConfirmation === null && !past) body = (
    <View>
      <Muted>Accepted. Tell a friend where you're going. We'll ask afterwards whether it happened.</Muted>
      {api.demoSkipToAfter && <Button kind="quiet" label="Demo: skip to after the date" onPress={() => run(api.demoSkipToAfter!(p.id))} style={{ marginTop: 10 }} />}
    </View>);
  else if (p.myConfirmation === null) body = (
    <View>
      <Text style={styles.q}>Did the date happen?</Text>
      <Muted style={{ fontSize: 12 }}>{name} is asked separately. Neither of you sees the other's answer.</Muted>
      <View style={styles.row}>
        <Button kind="quiet" label="No" onPress={() => run(api.confirmDate(p.id, false))} style={{ flex: 1 }} />
        <Button label="Yes, we met" onPress={() => run(api.confirmDate(p.id, true))} style={{ flex: 1 }} />
      </View>
    </View>);
  else if (p.myConfirmation === false) body = <Muted>Thanks for letting us know.</Muted>;
  else if (p.status !== 'confirmed') body = <Muted>Thanks. Waiting for {name} to confirm too.</Muted>;
  else if (!p.myFeedbackGiven) body = <Feedback onSubmit={(f) => run(api.submitDateFeedback(p.id, f))} />;
  else body = <Muted>Thanks. Your answers are private and only ever counted as an average.</Muted>;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{p.venue}</Text>
      <Muted style={{ marginBottom: 10 }}>{fmt(p.startsAt)}</Muted>
      {body}
    </View>
  );
}

function Feedback({ onSubmit }: { onSubmit: (f: DateFeedback) => void }) {
  const [f, setF] = useState<Partial<DateFeedback>>({ feltUnsafe: false });
  const complete = QUESTIONS.every(([k]) => typeof f[k] === 'number');
  return (
    <View>
      <Text style={styles.q}>How was it? Only you see your answers.</Text>
      {QUESTIONS.map(([k, q]) => (
        <View key={k} style={{ marginTop: 12 }}>
          <Text style={styles.qText}>{q}</Text>
          <View style={styles.scale}>{[1, 2, 3, 4, 5].map((n) => <Chip key={n} label={String(n)} on={f[k] === n} onPress={() => setF({ ...f, [k]: n })} wide />)}</View>
        </View>
      ))}
      <View style={{ marginTop: 14 }}>
        <Chip label={f.feltUnsafe ? 'Something made me feel unsafe ✓' : 'Something made me feel unsafe'} on={!!f.feltUnsafe} onPress={() => setF({ ...f, feltUnsafe: !f.feltUnsafe })} />
        <Muted style={{ fontSize: 12, marginTop: 6 }}>This goes straight to our safety team as a report. It never affects anyone's scores.</Muted>
      </View>
      <Button label="Send privately" disabled={!complete} onPress={() => onSubmit(f as DateFeedback)} style={{ marginTop: 14 }} />
    </View>
  );
}

function Chip({ label, on, onPress, wide }: { label: string; on: boolean; onPress: () => void; wide?: boolean }) {
  return <Button kind={on ? 'primary' : 'quiet'} label={label} onPress={onPress} style={[styles.chip, wide && { flex: 1 }] as any} />;
}

const styles = themed(() => StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: radius.card, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.foil },
  title: { color: colours.text, fontFamily: serif, fontSize: 19 },
  q: { color: colours.text, fontWeight: '700', marginBottom: 4 },
  qText: { color: colours.text, fontSize: 14, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { paddingVertical: 7, paddingHorizontal: 11 },
  scale: { flexDirection: 'row', gap: 6 },
  input: { marginTop: 10, backgroundColor: colours.bg, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  error: { color: colours.danger, marginHorizontal: 16, marginBottom: 8 },
}));
