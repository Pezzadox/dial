// The round Dial for a whole person. 70 or more means you're interested: if they dial you
// 70 or more too, it's a match. Lower scores stay private and they simply move on.
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { api, MATCH_THRESHOLD, type Media } from '../api';
import { MediaTile } from './MediaTile';
import { PowerGauge } from './PowerGauge';
import { Muted } from './ui';
import { colours, radius, serif, themed } from '../theme';

type Props = {
  personId: string; name: string; age?: number; photo?: Media; size?: number; withNote?: boolean;
  onDone: (result: { matchId: string | null; score: number }) => void;
};

export function ProfileDial({ personId, name, age, photo, size = 220, withNote = true, onDone }: Props) {
  const [note, setNote] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rate = async (v: number) => {
    setScore(v);
    try { const { matchId } = await api.dialProfile(personId, v, note); setTimeout(() => onDone({ matchId, score: v }), 650); }
    catch (e: any) { setError(String(e?.message ?? e)); }
  };
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>Your Dial for</Text>
      <Text style={styles.name}>{name}{age ? `, ${age}` : ''}</Text>
      {withNote && (
        <TextInput value={note} onChangeText={setNote} placeholder={`A note for ${name}, if it's a match (optional)`} placeholderTextColor={colours.slate}
          style={styles.input} maxLength={300} accessibilityLabel="Note" />
      )}
      <PowerGauge shape="ring" width={size} height={size} score={score} onRate={rate} threshold={MATCH_THRESHOLD} showPill={false}>
        {photo ? <MediaTile media={photo} width={size} height={size} small /> : <View style={{ width: size, height: size, backgroundColor: colours.surfaceRaised }} />}
      </PowerGauge>
      <Text style={styles.result}>
        {score == null ? 'Hold and turn' : score >= MATCH_THRESHOLD ? `Dialled ${score} · interested` : `Dialled ${score}`}
      </Text>
      <Muted style={styles.help}>The gold mark is {MATCH_THRESHOLD}. Dial {MATCH_THRESHOLD} or more and if {name} does the same, it's a match. Lower scores are private.</Muted>
      {!!error && <Text style={{ color: colours.danger, marginTop: 8 }}>{error}</Text>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 8 },
  eyebrow: { color: colours.slate, fontSize: 11, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase' },
  name: { color: colours.text, fontFamily: serif, fontSize: 30, marginBottom: 14 },
  input: { alignSelf: 'stretch', marginBottom: 18, backgroundColor: colours.surface, borderRadius: radius.pill, borderWidth: 1, borderColor: colours.line,
           color: colours.text, paddingHorizontal: 18, paddingVertical: 12, fontSize: 14 },
  result: { color: colours.text, fontSize: 13, fontWeight: '600', letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 14 },
  help: { textAlign: 'center', fontSize: 12, marginTop: 6, paddingHorizontal: 12 },
}));
