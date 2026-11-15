import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { IDEAL_PARTNER, PERSONALITY, highlights, scoreAnswers } from '../core/assessment';
import { Button, Card, H1, Muted } from '../components/ui';
import { colours, serif, themed } from '../theme';

/** The personality game. With ideal=true, the same scenarios are answered for the partner you would wish for. */
export function Assessment({ onDone, ideal }: { onDone: () => void; ideal?: boolean }) {
  const QUESTIONS = ideal ? IDEAL_PARTNER : PERSONALITY;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ ink: number; tags: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (result) return (
    <ScrollView contentContainerStyle={styles.page}>
      <H1>{ideal ? 'Your ideal partner' : 'Your highlights'}</H1>
      <Muted>{ideal ? 'Private to you. We use it to find people who fit, and you only ever see a score.' : 'These appear on your card and help us suggest people you might click with.'}</Muted>
      <View style={styles.tags}>{result.tags.map((t) => <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>)}</View>
      {result.ink > 0 && <Text style={styles.ink}>+{result.ink} Ink</Text>}
      <Muted style={{ fontSize: 12, marginTop: 16 }}>A playful insight, not a psychological assessment. You can retake it any time.</Muted>
      <Button label="Done" onPress={onDone} style={{ marginTop: 24 }} />
    </ScrollView>
  );

  const q = QUESTIONS[step];
  const choose = async (i: number) => {
    const next = { ...answers, [q.id]: i };
    setAnswers(next);
    if (step < QUESTIONS.length - 1) { setStep(step + 1); return; }
    const traits = scoreAnswers(QUESTIONS, next);
    try { const ink = ideal ? await api.submitIdealPartner(traits) : await api.submitAssessment('personality', traits); setResult({ ink, tags: highlights(traits) }); }
    catch (e: any) { setError(String(e?.message ?? e)); }
  };
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.top}>
        <Muted>Question {step + 1} of {QUESTIONS.length}</Muted>
        <Button kind="quiet" label="Later" onPress={onDone} style={{ paddingVertical: 6 }} />
      </View>
      <View style={styles.bar}><View style={[styles.fill, { width: `${(step / QUESTIONS.length) * 100}%` }]} /></View>
      <Text style={styles.prompt}>{q.prompt}</Text>
      {q.options.map((o, i) => (
        <Card key={o.label} style={{ marginTop: 10, padding: 0 }}>
          <Button kind={answers[q.id] === i ? 'primary' : 'quiet'} label={o.label} onPress={() => choose(i)} style={{ borderWidth: 0 }} />
        </Card>
      ))}
      {step > 0 && <Button kind="quiet" label="Back" onPress={() => setStep(step - 1)} style={{ marginTop: 18, alignSelf: 'flex-start' }} />}
      {!!error && <Text style={{ color: colours.danger, marginTop: 12 }}>{error}</Text>}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  page: { padding: 16, paddingBottom: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bar: { height: 4, borderRadius: 2, backgroundColor: colours.line, marginTop: 12, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colours.accent },
  prompt: { color: colours.text, fontFamily: serif, fontSize: 28, lineHeight: 36, marginTop: 28, marginBottom: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  tag: { borderRadius: 999, borderWidth: 1, borderColor: colours.accent, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colours.accentTint },
  tagText: { color: colours.text, fontSize: 15, fontWeight: '600' },
  ink: { color: colours.good, fontFamily: serif, fontSize: 30, marginTop: 24 },
}));
