// "About you": the words on a profile. Used once when someone joins, and from Profile afterwards.
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type Me } from '../api';
import { Button, H1, Muted } from '../components/ui';
import { colours, radius, themed } from '../theme';

export const INTENTIONS = ['something serious', 'seeing where it goes', 'something casual', 'not sure yet'];
export const INTEREST_OPTIONS = [
  'Hiking', 'Wild swimming', 'Running', 'Climbing', 'Cycling', 'Yoga', 'Gym', 'Football',
  'Cooking', 'Baking', 'Wine', 'Coffee', 'Brunch', 'Travel', 'Festivals', 'Live music',
  'Jazz', 'Vinyl', 'Film', 'Theatre', 'Art galleries', 'Books', 'Board games', 'Gaming',
  'Photography', 'Ceramics', 'Fashion', 'Dogs', 'Gardening', 'Volunteering',
];
const MAX_INTERESTS = 8;

export function AboutEditor({ me, firstTime, onDone }: { me: Me; firstTime?: boolean; onDone: () => void }) {
  const [bio, setBio] = useState(me.bio ?? '');
  const [occupation, setOccupation] = useState(me.occupation ?? '');
  const [city, setCity] = useState(me.city ?? '');
  const [intentions, setIntentions] = useState(me.intentions ?? '');
  const [interests, setInterests] = useState<string[]>(me.interests);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const options = [...INTEREST_OPTIONS, ...interests.filter((i) => !INTEREST_OPTIONS.includes(i))];
  const toggle = (i: string) => setInterests((xs) => xs.includes(i) ? xs.filter((x) => x !== i) : xs.length >= MAX_INTERESTS ? xs : [...xs, i]);
  const save = async () => {
    setBusy(true); setError(null);
    try { await api.saveAbout({ bio, occupation, city, intentions, interests }); onDone(); }
    catch (e: any) { setError(String(e?.message ?? e)); } finally { setBusy(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {firstTime && <Text style={styles.kicker}>One last thing · About you</Text>}
      <H1>{firstTime ? 'Make it yours' : 'About you'}</H1>
      <Muted>{firstTime ? 'A few words and what you love. Specific beats clever: it gives people something to dial and to talk about.' : 'This is what people read before they dial you.'}</Muted>

      <Text style={styles.label}>A line about you</Text>
      <TextInput value={bio} onChangeText={setBio} multiline maxLength={500} style={[styles.input, { minHeight: 84, textAlignVertical: 'top', borderRadius: 16 }]}
        placeholder="I will make you look at a tree for longer than you expected." placeholderTextColor={colours.slate} accessibilityLabel="A line about you" />
      <Muted style={styles.count}>{bio.length} / 500</Muted>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>What you do</Text>
          <TextInput value={occupation} onChangeText={setOccupation} maxLength={80} style={styles.input} placeholder="Job or passion" placeholderTextColor={colours.slate} accessibilityLabel="What you do" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Town or city</Text>
          <TextInput value={city} onChangeText={setCity} maxLength={60} style={styles.input} placeholder="Leeds" placeholderTextColor={colours.slate} accessibilityLabel="Town or city" />
        </View>
      </View>

      <Text style={styles.label}>Looking for</Text>
      <View style={styles.chips}>
        {INTENTIONS.map((i) => <Chip key={i} label={i} on={intentions === i} onPress={() => setIntentions(i)} />)}
      </View>

      <Text style={styles.label}>Interests · {interests.length} of {MAX_INTERESTS}</Text>
      <View style={styles.chips}>
        {options.map((i) => <Chip key={i} label={i} on={interests.includes(i)} dim={!interests.includes(i) && interests.length >= MAX_INTERESTS} onPress={() => toggle(i)} />)}
      </View>

      {!!error && <Text style={{ color: colours.danger, marginTop: 12 }}>{error}</Text>}
      <Button label={busy ? 'Saving…' : firstTime ? 'Save and continue' : 'Save'} onPress={save} disabled={busy || interests.length === 0}
        style={{ marginTop: 24 }} />
      {interests.length === 0 && <Muted style={{ textAlign: 'center', marginTop: 8, fontSize: 12 }}>Pick at least one interest.</Muted>}
      <Button kind="quiet" label={firstTime ? 'Do this later' : 'Cancel'} onPress={onDone} style={{ marginTop: 10 }} />
    </ScrollView>
  );
}

function Chip({ label, on, dim, onPress }: { label: string; on: boolean; dim?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn, dim && { opacity: 0.4 }]} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
      <Text style={[styles.chipText, on && { color: colours.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  kicker: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 8 },
  label: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 },
  input: { backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  count: { textAlign: 'right', fontSize: 11, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colours.line, paddingHorizontal: 13, paddingVertical: 8 },
  chipOn: { borderColor: colours.accent, backgroundColor: colours.accentTint },
  chipText: { color: colours.slate, fontSize: 13, textTransform: 'capitalize' },
}));
