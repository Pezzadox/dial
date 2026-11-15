// Build one of your top three types: a look plus an optional vibe.
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { Avatar, describe } from '../components/Avatar';
import { HeightSlider } from '../components/HeightSlider';
import { Button, H1, Muted } from '../components/ui';
import { BUILD, EYES, HAIR, HAIR_LENGTH, VIBES, type IdealType } from '../core/looks';
import { colours, themed } from '../theme';

const empty = (rank: 1 | 2 | 3): IdealType => ({ rank, hairColours: [], hairLengths: [], eyeColours: [], builds: [], heightMin: null, heightMax: null, vibes: [] });
const SMILING = ['bubbly', 'playful', 'warm'];

export function TypeBuilder({ rank, initial, onDone }: { rank: 1 | 2 | 3; initial?: IdealType; onDone: () => void }) {
  const [t, setT] = useState<IdealType>(initial ?? empty(rank));
  const [error, setError] = useState<string | null>(null);
  const toggle = (key: 'hairColours' | 'hairLengths' | 'eyeColours' | 'builds' | 'vibes', v: string, max = 9) => {
    const list = t[key];
    setT({ ...t, [key]: list.includes(v) ? list.filter((x) => x !== v) : list.length >= max ? list : [...list, v] });
  };
  const anyHeight = t.heightMin == null && t.heightMax == null;
  const preview = { hairColour: t.hairColours[0], hairLength: t.hairLengths[0] ?? 'medium', eyeColour: t.eyeColours[0], build: t.builds[0] };
  const filled = t.hairColours.length + t.hairLengths.length + t.eyeColours.length + t.builds.length + t.vibes.length > 0 || !anyHeight;
  const save = () => api.saveIdealType(t).then(onDone).catch((e) => setError(String(e?.message ?? e)));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <H1>Your #{rank} type</H1>
      <Muted>Pick as many as you like in each row. Leave a row empty if it doesn't matter.</Muted>
      <View style={styles.preview}>
        <View style={styles.avatar}><Avatar look={preview} size={110} smile={t.vibes.some((v) => SMILING.includes(v))} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summary}>{describe(preview) || 'Anyone'}</Text>
          {t.vibes.length > 0 && <Muted>{t.vibes.join(', ')}</Muted>}
          <Muted style={{ fontSize: 12, marginTop: 6 }}>An illustration of the type, not a real person.</Muted>
        </View>
      </View>
      <Row title="Hair colour" values={HAIR} chosen={t.hairColours} onPick={(v) => toggle('hairColours', v)} />
      <Row title="Hair length" values={HAIR_LENGTH} chosen={t.hairLengths} onPick={(v) => toggle('hairLengths', v)} />
      <Row title="Eyes" values={EYES} chosen={t.eyeColours} onPick={(v) => toggle('eyeColours', v)} />
      <Row title="Build" values={BUILD} chosen={t.builds} onPick={(v) => toggle('builds', v)} />
      <View style={{ marginTop: 16 }}>
        <Text style={styles.rowTitle}>Height</Text>
        <View style={styles.chips}>
          <Button kind={anyHeight ? 'primary' : 'quiet'} label="Any height" onPress={() => setT({ ...t, heightMin: null, heightMax: null })} style={styles.chip} />
          <Button kind={anyHeight ? 'quiet' : 'primary'} label="Choose a range" onPress={() => setT({ ...t, heightMin: t.heightMin ?? 157, heightMax: t.heightMax ?? 175 })} style={styles.chip} />
        </View>
        {!anyHeight && <View style={{ marginTop: 12 }}>
          <HeightSlider range low={t.heightMin ?? 157} high={t.heightMax ?? 175} onChange={(low, high) => setT({ ...t, heightMin: low, heightMax: high })} />
        </View>}
      </View>
      <Row title="Vibe (up to 3)" values={Object.keys(VIBES)} chosen={t.vibes} onPick={(v) => toggle('vibes', v, 3)} />
      <Muted style={{ fontSize: 12, marginTop: 8 }}>
        Your ideal partner answers apply to all three types. A vibe only adds a little flavour for this one.
      </Muted>
      {!!error && <Text style={{ color: colours.danger, marginTop: 10 }}>{error}</Text>}
      <View style={styles.actions}>
        {initial ? <Button kind="quiet" label="Remove" onPress={() => api.deleteIdealType(rank).then(onDone)} style={{ flex: 1 }} />
                 : <Button kind="quiet" label="Cancel" onPress={onDone} style={{ flex: 1 }} />}
        <Button label="Save type" onPress={save} disabled={!filled} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  );
}

function Row({ title, values, chosen, onPick }: { title: string; values: readonly string[]; chosen: string[]; onPick: (v: string) => void }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <View style={styles.chips}>
        {values.map((v) => <Button key={v} kind={chosen.includes(v) ? 'primary' : 'quiet'} label={v} onPress={() => onPick(v)} style={styles.chip} />)}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  preview: { flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 16 },
  avatar: { borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colours.line },
  summary: { color: colours.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  rowTitle: { color: colours.text, fontWeight: '700', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 7, paddingHorizontal: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
}));
