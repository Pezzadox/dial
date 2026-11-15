// Look before you dial: flick through all five photos or videos of each of the ten, then choose one.
// Tap the right of the photo for the next, the left for the previous; the arrows move between people.
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, Platform } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Button } from '../components/ui';
import { play } from '../sound';
import { serif } from '../theme';
import { SECTION, milesLabel, type QPerson } from './core';
import { quick, type TheirDial } from './api';
import { colours } from '../theme';
import { MediaFull } from './Visual';

export function Preview({ people, start, onClose, onChoose }:
  { people: QPerson[]; start: number; onClose: () => void; onChoose: (p: QPerson) => void }) {
  const { width, height } = useWindowDimensions();
  const [who, setWho] = useState(start);
  const [k, setK] = useState(0);
  const person = people[who];
  const n = person.media.length;
  const [their, setTheir] = useState<TheirDial | null>(null);
  useEffect(() => { setTheir(null); quick.getTheirDial(person.id).then(setTheir).catch(() => setTheir(null)); }, [person.id]);

  const person_ = (d: number) => {
    const next = (who + d + people.length) % people.length;
    setWho(next); setK(0); play('tap', 0.4);
  };
  const step = (d: number) => {
    if (k + d >= n) return person_(1);
    if (k + d < 0) return who > 0 ? (setWho(who - 1), setK(people[who - 1].media.length - 1)) : undefined;
    setK(k + d);
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'Enter') onChoose(person); else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <MediaFull key={person.media[k].id} media={person.media[k]} look={person.look} width={width} height={height} />
      <View style={[StyleSheet.absoluteFill, styles.scrim]} pointerEvents="none" />

      {/* Tap zones: left half back, right half forward */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', top: 120, bottom: 210 }]}>
        <Pressable style={{ flex: 1 }} onPress={() => step(-1)} accessibilityRole="button" accessibilityLabel="Previous photo" />
        <Pressable style={{ flex: 1 }} onPress={() => step(1)} accessibilityRole="button" accessibilityLabel="Next photo" />
      </View>

      <View style={styles.bars} pointerEvents="none">
        {person.media.map((_, j) => <View key={j} style={[styles.bar, j <= k && styles.barOn]} />)}
      </View>
      <View style={styles.top}>
        <Pressable onPress={onClose} hitSlop={14} accessibilityRole="button" accessibilityLabel="Back to the circles"><Feather name="x" size={22} color="#fff" /></Pressable>
        <View style={{ flex: 1, alignItems: 'center' }} pointerEvents="none">
          <Text style={styles.name}>{person.firstName}, {person.age}{person.verified ? ' ' : ''}{person.verified && <Feather name="check-circle" size={16} color="#7FD6FF" />}</Text>
          <Text style={styles.city}>{[person.city, person.miles != null ? `${milesLabel(person.miles)} away` : null].filter(Boolean).join(' · ')}</Text>
        </View>
        <Text style={styles.count}>{who + 1}/{people.length}</Text>
      </View>

      <View style={styles.footer}>
        <TheirDialChip their={their} name={person.firstName} />
        <Text style={styles.hint}>{SECTION[person.media[k].kind]} {k + 1}/{n} · tap for more · arrows for next person</Text>
        <View style={styles.row}>
          <Pressable onPress={() => person_(-1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Previous person" hitSlop={8}>
            <Feather name="chevron-left" size={22} color="#fff" />
          </Pressable>
          <Button label={`Dial ${person.firstName}`} onPress={() => { play('open', 0.6); onChoose(person); }} style={{ flex: 1 }} />
          <Pressable onPress={() => person_(1)} style={styles.arrow} accessibilityRole="button" accessibilityLabel="Next person" hitSlop={8}>
            <Feather name="chevron-right" size={22} color="#fff" />
          </Pressable>
        </View>
        <View style={styles.people}>
          {people.map((p, j) => <View key={p.id} style={[styles.pip, j === who && styles.pipOn]} />)}
        </View>
      </View>
    </View>
  );
}

/** Their Dial: only with their permission, from 10+ people, and (once plans are live) for Quick+. */
function TheirDialChip({ their, name }: { their: TheirDial | null; name: string }) {
  if (!their) return null;
  if (!their.available) {
    const text = their.reason === 'upgrade' ? `Quick+ shows ${name}'s Dial` : their.reason === 'private' ? `${name} keeps their Dial private` : `${name} is too new for a Dial`;
    return <View style={styles.chip}><Feather name={their.reason === 'upgrade' ? 'lock' : 'eye-off'} size={12} color="#fff" /><Text style={styles.chipText}>{text}</Text></View>;
  }
  return (
    <View style={styles.chip} accessibilityLabel={`${name}'s Dial ${their.score} from ${their.raters} people`}>
      <Text style={styles.chipScore}>{their.score}</Text>
      <Text style={styles.chipText}>Their Dial · Looks {their.looks} · Vibe {their.vibe} · Personality {their.personality}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(8,7,15,0.65)', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(234,219,194,0.5)', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10 },
  chipScore: { color: '#EADBC2', fontFamily: serif, fontSize: 20 },
  chipText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  stage: { zIndex: 45, backgroundColor: '#000' },
  scrim: { backgroundColor: 'rgba(8,7,15,0.18)' },
  bars: { position: 'absolute', top: 10, left: 14, right: 14, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' },
  barOn: { backgroundColor: '#fff' },
  top: { position: 'absolute', top: 24, left: 20, right: 20, flexDirection: 'row', alignItems: 'center' },
  name: { color: '#fff', fontFamily: serif, fontSize: 28, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 8 },
  city: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  count: { color: '#fff', fontSize: 13, fontWeight: '700', width: 40, textAlign: 'right' },
  footer: { position: 'absolute', left: 20, right: 20, bottom: 26, alignItems: 'center', maxWidth: 460, marginHorizontal: 'auto' as any },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', alignSelf: 'stretch' },
  arrow: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', alignItems: 'center', justifyContent: 'center' },
  people: { flexDirection: 'row', gap: 5, marginTop: 14 },
  pip: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  pipOn: { width: 18, backgroundColor: '#fff' },
});
