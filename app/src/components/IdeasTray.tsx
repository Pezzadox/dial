// AI reply ideas: pick a tone, get three replies that move things on. Tap one to put it in
// your message box, edit it if you like, then send it yourself.
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { api, type Tone } from '../api';
import { colours, radius, themed } from '../theme';
import { Button, Muted } from './ui';

const TONES: [Tone, string][] = [['playful', 'Playful'], ['curious', 'Curious'], ['deeper', 'Go deeper'], ['ask_out', 'Ask them out']];

export function IdeasTray({ matchId, level, onPick, onClose }: { matchId: string; level: number; onPick: (text: string) => void; onClose: () => void }) {
  const [tone, setTone] = useState<Tone>(level >= 4 ? 'ask_out' : 'curious');
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true; setIdeas(null); setError(null);
    api.getSuggestions(matchId, tone)
      .then((r) => { if (!live) return; setIdeas(r.suggestions); setNote(r.usedTheirMessages ? null : 'Based on your messages and shared interests. Their messages are only used if they turn that on.'); })
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => { live = false; };
  }, [matchId, tone]);
  return (
    <View style={styles.tray}>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>✦ Reply ideas</Text>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close reply ideas" hitSlop={10}><Text style={styles.close}>Close</Text></Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {TONES.map(([t, label]) => <Button key={t} kind={tone === t ? 'primary' : 'quiet'} label={label} onPress={() => setTone(t)} style={styles.chip} />)}
      </ScrollView>
      {!ideas && !error && <Muted style={{ marginTop: 10 }}>Thinking of something good…</Muted>}
      {error && <Text style={{ color: colours.danger, marginTop: 10 }}>{error}</Text>}
      {ideas?.map((s) => (
        <Pressable key={s} onPress={() => onPick(s)} style={({ pressed }) => [styles.idea, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Use: ${s}`}>
          <Text style={styles.ideaText}>{s}</Text>
        </Pressable>
      ))}
      {note && ideas && <Muted style={{ fontSize: 11, marginTop: 6 }}>{note}</Muted>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  tray: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: radius.card, backgroundColor: colours.surfaceSolid, borderWidth: 1, borderColor: colours.line },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  eyebrow: { color: colours.foil, fontSize: 10, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase' },
  close: { color: colours.slate, fontSize: 12 },
  chip: { paddingVertical: 7, paddingHorizontal: 12 },
  idea: { marginTop: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  ideaText: { color: colours.text, fontSize: 14, lineHeight: 20 },
}));
