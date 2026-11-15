// Report or block someone, from a chat or a profile. Reporting blocks them too unless the member says not to.
import React, { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { api, type ReportReason } from '../api';
import { Button, Muted } from './ui';
import { colours, radius, serif, themed } from '../theme';

export const REASONS: [ReportReason, string][] = [
  ['harassment', 'Harassment or pressure'],
  ['felt_unsafe', 'I feel unsafe'],
  ['inappropriate_photos', 'Inappropriate photos or messages'],
  ['fake_profile', 'Fake profile or not who they say'],
  ['spam_or_scam', 'Spam, scam or asking for money'],
  ['underage', 'May be under 18'],
  ['other', 'Something else'],
];
export const reasonLabel = (r: string) => REASONS.find(([k]) => k === r)?.[1] ?? (r === 'felt_unsafe_on_date' ? 'Felt unsafe on a date' : r);

type Actions = { report: (reason: ReportReason, detail: string, block: boolean) => Promise<void>; block: () => Promise<void> };

/** `actions` lets Quick Dial use its own data layer; Dial uses the main one. */
export function SafetySheet({ person, start = 'menu', onDone, onCancel, actions }:
  { person: { id: string; firstName: string }; start?: 'menu' | 'report'; onDone: (blocked: boolean) => void; onCancel: () => void; actions?: Actions }) {
  const act: Actions = actions ?? { report: (r, d, b) => api.reportMember(person.id, r, d, b), block: () => api.blockMember(person.id) };
  const [step, setStep] = useState<'menu' | 'report' | 'block' | 'done'>(start);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [didBlock, setDidBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = person.firstName;

  const submit = async (fn: () => Promise<void>, blocked: boolean) => {
    setBusy(true); setError(null);
    try { await fn(); setDidBlock(blocked); setStep('done'); } catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  return (
    <View style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.head}>
        <Text style={styles.title}>{step === 'done' ? 'Thank you' : step === 'block' ? `Block ${name}?` : step === 'report' ? `Report ${name}` : 'Safety'}</Text>
        <Pressable onPress={() => (step === 'done' ? onDone(didBlock) : onCancel())} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Feather name="x" size={18} color={colours.slate} />
        </Pressable>
      </View>

      {step === 'menu' && (
        <View style={{ gap: 8 }}>
          <Row icon="flag" title={`Report ${name}`} body="Tell our team what happened. They're never told it was you." onPress={() => setStep('report')} />
          <Row icon="slash" title={`Block ${name}`} body="You disappear for each other, and any chat ends." onPress={() => setStep('block')} />
          <Muted style={styles.small}>In danger right now? Call 999.</Muted>
        </View>
      )}

      {step === 'report' && (
        <View style={{ gap: 8 }}>
          <Muted>What's happening?</Muted>
          {REASONS.map(([k, label]) => (
            <Pressable key={k} onPress={() => setReason(k)} style={[styles.reason, reason === k && styles.reasonOn]} accessibilityRole="radio" accessibilityState={{ checked: reason === k }}>
              <View style={[styles.dot, reason === k && styles.dotOn]} />
              <Text style={styles.reasonText}>{label}</Text>
            </Pressable>
          ))}
          <TextInput value={detail} onChangeText={setDetail} multiline maxLength={1000} placeholder="Anything that helps us understand (optional)"
            placeholderTextColor={colours.slate} style={styles.input} accessibilityLabel="Details" />
          <View style={styles.switchRow}>
            <Text style={[styles.reasonText, { flex: 1 }]}>Block {name} as well</Text>
            <Switch value={alsoBlock} onValueChange={setAlsoBlock} accessibilityLabel={`Block ${name} as well`} trackColor={{ true: colours.accent, false: colours.line }} />
          </View>
          {reason === 'felt_unsafe' && <Muted style={[styles.small, { color: colours.foil }]}>If you're in danger now, call 999 first.</Muted>}
          <Button label={busy ? 'Sending…' : 'Send report'} disabled={!reason || busy}
            onPress={() => submit(() => act.report(reason!, detail, alsoBlock), alsoBlock)} />
        </View>
      )}

      {step === 'block' && (
        <View style={{ gap: 10 }}>
          <Muted>{name} won't be told. You'll stop seeing each other everywhere in Dial, and your chat will close. You can unblock later in Profile › Safety.</Muted>
          <Button label={busy ? 'Blocking…' : `Block ${name}`} disabled={busy} onPress={() => submit(() => act.block(), true)} />
          <Button kind="quiet" label="Report instead" onPress={() => setStep('report')} />
        </View>
      )}

      {step === 'done' && (
        <View style={{ gap: 12 }}>
          <Muted>{reason ? `Our team reviews every report, usually within 24 hours. ${name} won't be told who reported them.` : ''}
            {didBlock ? `${reason ? ' ' : ''}${name} is blocked, and your chat has ended.` : ''}</Muted>
          <Button label="Done" onPress={() => onDone(didBlock)} />
        </View>
      )}
      {!!error && <Text style={{ color: colours.danger, marginTop: 8 }}>{error}</Text>}
    </View>
  );
}

function Row({ icon, title, body, onPress }: { icon: React.ComponentProps<typeof Feather>['name']; title: string; body: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <Feather name={icon} size={18} color={colours.accent} />
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Muted style={styles.small}>{body}</Muted></View>
      <Feather name="chevron-right" size={16} color={colours.slate} />
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  sheet: { margin: 16, padding: 18, borderRadius: radius.card, backgroundColor: colours.surfaceRaised, borderWidth: 1, borderColor: colours.line },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { color: colours.text, fontFamily: serif, fontSize: 26 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line },
  rowTitle: { color: colours.text, fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  reason: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line },
  reasonOn: { borderColor: colours.accent, backgroundColor: colours.accentTint },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: colours.slate },
  dotOn: { borderColor: colours.accent, backgroundColor: colours.accent },
  reasonText: { color: colours.text, fontSize: 14 },
  input: { backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, color: colours.text, padding: 12, fontSize: 14, minHeight: 72, textAlignVertical: 'top', borderRadius: 16 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
}));
