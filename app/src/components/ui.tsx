import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { CHAPTERS } from '../core/economy';
import { colours, radius, serif, themed } from '../theme';
import { play } from '../sound';

export function Button({ label, onPress, kind = 'primary', disabled, style }:
  { label: string; onPress: () => void; kind?: 'primary' | 'quiet'; disabled?: boolean; style?: ViewStyle }) {
  return (
    <Pressable onPress={() => { play('tap', kind === 'primary' ? 0.7 : 0.45); onPress(); }} disabled={disabled} accessibilityRole="button"
      style={({ pressed }) => [styles.button, kind === 'primary' ? styles.primary : styles.quiet, (pressed || disabled) && { opacity: 0.6 }, style]}>
      <Text style={[styles.buttonText, kind === 'quiet' && { color: colours.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Chapter shown like a page number: a small italic numeral and the Chapter name. */
export function ChapterBadge({ chapter }: { chapter?: number }) {
  const c = CHAPTERS.find((x) => x.number === chapter) ?? CHAPTERS[0];
  return (
    <View style={styles.badge} accessibilityLabel={`Chapter ${c.number}, ${c.name}`}>
      <Text style={[styles.badgeNumeral, { color: c.colour }]}>{c.numeral}</Text>
      <Text style={styles.badgeText}>{c.name}</Text>
    </View>
  );
}

export function LevelLine({ level }: { level: number }) {
  return (
    <View style={styles.levels} accessibilityLabel={`Conversation level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((l) => <View key={l} style={[styles.level, l <= level && { backgroundColor: colours.accent }]} />)}
    </View>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => <Text style={styles.h1}>{children}</Text>;
export const Muted = ({ children, style }: { children: React.ReactNode; style?: any }) => <Text style={[styles.muted, style]}>{children}</Text>;
export const Card = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => <View style={[styles.card, style]}>{children}</View>;

const styles = themed(() => StyleSheet.create({
  button: { borderRadius: radius.control, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center' },
  primary: { backgroundColor: colours.accent, shadowColor: colours.accent, shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  quiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colours.line },
  buttonText: { color: colours.onAccent, fontWeight: '600', fontSize: 14, letterSpacing: 0.3 },
  badge: { flexDirection: 'row', alignItems: 'baseline', gap: 6, alignSelf: 'flex-start' },
  badgeNumeral: { fontFamily: serif, fontSize: 17 },
  badgeText: { color: colours.slate, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  levels: { flexDirection: 'row', gap: 4 },
  level: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colours.line },
  h1: { color: colours.text, fontFamily: serif, fontSize: 38, lineHeight: 42, marginBottom: 6 },
  muted: { color: colours.slate, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colours.surface, borderRadius: radius.card, padding: 20, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: colours.line },
}));
