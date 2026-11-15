// You: your own Dial over time (averages only, once 5+ people have dialled you), what's working,
// who can see your Dial, verification, plans, and your account (sign out, delete).
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import Feather from '@expo/vector-icons/Feather';
import { Button, Card, H1, Muted } from '../components/ui';
import { dialWord } from '../core/gauge';
import { play, setSoundOn, soundOn } from '../sound';
import { DIAL_GRADIENT, colours, serif, themed } from '../theme';
import { quick, showPurchases } from './api';
import { PLANS, QD, dialTip, hasDial, perDayLabel, type MyDial, type Tier } from './core';
import { useQuick } from './useQuick';
import { Ring } from './Visual';
import { EditProfile } from './EditProfile';

export function You({ width, onLeave }: { width: number; onLeave: () => void }) {
  const { data: dial } = useQuick(() => quick.getMyDial());
  const { data: settings } = useQuick(() => quick.getSettings());
  const [plans, setPlans] = useState(false);
  const [edit, setEdit] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sound, setSound] = useState(soundOn());
  if (edit) return <EditProfile onBack={() => setEdit(false)} />;
  if (deleting) return <DeleteAccount onBack={() => setDeleting(false)} onDeleted={onLeave} />;
  if (plans) return <Plans current={settings?.tier ?? 'free'} live={!!settings?.plansLive} onBack={() => setPlans(false)} />;

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Text style={styles.kicker}>You</Text>
      <H1>Your Dial</H1>
      {!dial ? null : !hasDial(dial) ? (
        <Card style={{ marginTop: 14, padding: 18, alignItems: 'center' }}>
          <Ring value={(dial.raters / dial.needed) * 100} size={170} word="Building" />
          <Text style={styles.big}>{dial.raters} of {dial.needed}</Text>
          <Muted style={{ textAlign: 'center' }}>Your Dial appears once {dial.needed} people have dialled you, so no one person's score can be worked out.</Muted>
        </Card>
      ) : (
        <MyDialView dial={dial} width={width} />
      )}

      <Button label="Edit profile" onPress={() => setEdit(true)} style={{ marginTop: 14 }} />

      <Text style={styles.section}>Privacy</Text>
      <Card style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Show my Dial to people I'm shown to</Text>
          <Muted style={styles.small}>Averages only, once {QD.theirDialMinRaters}+ people have dialled you. Nobody ever sees one person's score.</Muted>
        </View>
        <Switch value={!!settings?.showDial} onValueChange={(v) => quick.setShowDial(v)} accessibilityLabel="Show my Dial" trackColor={{ true: colours.accent, false: colours.line }} />
      </Card>
      <Card style={[styles.row, { marginTop: 8 }] as any}>
        <Feather name={settings?.verified ? 'check-circle' : 'alert-circle'} size={20} color={settings?.verified ? '#7FD6FF' : colours.foil} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{settings?.verified ? 'Verified' : 'Not verified yet'}</Text>
          <Muted style={styles.small}>{settings?.verified ? 'Selfie and age check passed. Your badge shows on your circle.' : 'Finish the selfie check to be shown to others.'}</Muted>
        </View>
        {!settings?.verified && <Button label="Verify" onPress={() => quick.verify()} style={{ paddingVertical: 8 }} />}
      </Card>
      <Card style={[styles.row, { marginTop: 8 }] as any}>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>Sounds</Text></View>
        <Switch value={sound} onValueChange={(v) => { setSound(v); setSoundOn(v); if (v) play('tap'); }} accessibilityLabel="Sounds" trackColor={{ true: colours.accent, false: colours.line }} />
      </Card>

      {showPurchases() && <>
      <Text style={styles.section}>Plan</Text>
      <Card style={styles.row}>
        <Feather name="star" size={20} color={colours.foil} />
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>{PLANS.find((p) => p.tier === (settings?.tier ?? 'free'))!.name}</Text>
          <Muted style={styles.small}>{perDayLabel(PLANS.find((p) => p.tier === (settings?.tier ?? 'free'))!.perDay)}</Muted>
        </View>
        <Button kind="quiet" label="See plans" onPress={() => setPlans(true)} style={{ paddingVertical: 8, paddingHorizontal: 14 }} />
      </Card>
      </>}

      <Text style={styles.section}>Account</Text>
      {quick.mode !== 'demo' && (
        <Button kind="quiet" label="Sign out" onPress={async () => { await quick.signOut().catch(() => {}); onLeave(); }} />
      )}
      <Pressable onPress={() => setDeleting(true)} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center', padding: 8 }}>
        <Text style={styles.danger}>Delete account</Text>
      </Pressable>
    </ScrollView>
  );
}

function MyDialView({ dial, width }: { dial: Extract<MyDial, { score: number }>; width: number }) {
  return (
    <>
      <Card style={{ marginTop: 14, padding: 18, alignItems: 'center' }}>
        <Ring value={dial.score} size={190} word={dialWord(dial.score)} />
        <Muted style={{ marginTop: 6 }}>Average from {dial.raters} people · only you see this</Muted>
        <View style={styles.bars}>
          <Bar label="Looks" value={dial.looks} />
          <Bar label="Vibe" value={dial.vibe} />
          <Bar label="Personality" value={dial.personality} />
        </View>
      </Card>
      {dial.weeks.length >= 2 && (
        <Card style={{ marginTop: 10, padding: 16 }}>
          <Text style={styles.rowTitle}>Over time</Text>
          <Trend weeks={dial.weeks} width={width - 72} />
        </Card>
      )}
      <Card style={{ marginTop: 10, padding: 16, flexDirection: 'row', gap: 12 }}>
        <Feather name="zap" size={18} color={colours.foil} />
        <Text style={[styles.tip, { flex: 1 }]}>{dialTip(dial)}</Text>
      </Card>
    </>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  return (
    <View style={{ marginTop: 10, alignSelf: 'stretch' }} accessibilityLabel={`${label} ${value}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.barLabel}>{label}</Text><Text style={styles.barValue}>{value}</Text>
      </View>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${value}%` }]} /></View>
    </View>
  );
}

/** Weekly average, as a smooth line with the latest week marked. */
function Trend({ weeks, width }: { weeks: { week: string; score: number }[]; width: number }) {
  const h = 120, pad = 18;
  const min = Math.max(0, Math.min(...weeks.map((w) => w.score)) - 8), max = Math.min(100, Math.max(...weeks.map((w) => w.score)) + 8);
  const x = (i: number) => pad + (i * (width - pad * 2)) / (weeks.length - 1);
  const y = (v: number) => h - pad - ((v - min) / Math.max(1, max - min)) * (h - pad * 2);
  const d = weeks.map((w, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(w.score).toFixed(1)}`).join(' ');
  const last = weeks[weeks.length - 1], first = weeks[0];
  const label = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <View accessibilityLabel={`Your Dial went from ${first.score} to ${last.score} over ${weeks.length} weeks`}>
      <Svg width={width} height={h + 16}>
        <Defs><LinearGradient id="trend" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={DIAL_GRADIENT[0]} /><Stop offset="0.5" stopColor={DIAL_GRADIENT[1]} /><Stop offset="1" stopColor={DIAL_GRADIENT[2]} />
        </LinearGradient></Defs>
        <Line x1={pad} x2={width - pad} y1={y(QD.threshold)} y2={y(QD.threshold)} stroke={colours.foil} strokeOpacity={min < QD.threshold && max > QD.threshold ? 0.6 : 0} strokeDasharray="3 4" />
        <Path d={d} stroke="url(#trend)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {weeks.map((w, i) => <Circle key={w.week} cx={x(i)} cy={y(w.score)} r={i === weeks.length - 1 ? 5 : 2.5} fill={i === weeks.length - 1 ? '#fff' : colours.slate} />)}
        <SvgText x={x(weeks.length - 1)} y={y(last.score) - 10} fill={colours.text} fontSize={13} fontWeight="700" textAnchor="end">{last.score}</SvgText>
        <SvgText x={pad} y={h + 12} fill={colours.slate} fontSize={10}>{label(first.week)}</SvgText>
        <SvgText x={width - pad} y={h + 12} fill={colours.slate} fontSize={10} textAnchor="end">{label(last.week)}</SvgText>
      </Svg>
    </View>
  );
}

/** Delete account: says exactly what goes, asks once more, then does it. */
function DeleteAccount({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setError(null);
    try { await quick.deleteAccount(); onDeleted(); }
    catch (e: any) { setError(String(e?.message ?? e)); setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12} disabled={busy}><Text style={styles.back}><Feather name="chevron-left" size={14} color={colours.slate} /> You</Text></Pressable>
      <H1>Delete account</H1>
      <Muted>This can't be undone. Straight away, we delete:</Muted>
      {['Your profile, photos, video and stories', 'Your Dials, both given and received', 'Your chats and connections', 'Your location and notification settings'].map((t) => (
        <Text key={t} style={styles.perk}>✦  {t}</Text>
      ))}
      <Muted style={{ marginTop: 14 }}>If other members reported you, a record of those reports (not your photos or messages) is kept for 12 months to keep people safe.{showPurchases() ? ' If you pay for a plan, cancel it in your app store settings as well.' : ''}</Muted>
      {busy ? <ActivityIndicator color={colours.accent} style={{ marginTop: 24 }} />
        : !sure ? <Button label="Delete my account" onPress={() => setSure(true)} style={{ marginTop: 24, backgroundColor: colours.danger }} />
        : <>
            <Text style={[styles.rowTitle, { marginTop: 24, textAlign: 'center' }]}>Are you sure? Everything goes, for good.</Text>
            <Button label="Yes, delete everything" onPress={run} style={{ marginTop: 12, backgroundColor: colours.danger }} />
            <Button kind="quiet" label="Keep my account" onPress={onBack} style={{ marginTop: 10 }} />
          </>}
      {!!error && <Muted style={{ marginTop: 12, textAlign: 'center' }}>{error}</Muted>}
    </ScrollView>
  );
}

/** Plans: built and ready, switched on once there are enough people. */
export function Plans({ current, live, onBack }: { current: Tier; live: boolean; onBack: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}><Text style={styles.back}><Feather name="chevron-left" size={14} color={colours.slate} /> You</Text></Pressable>
      <H1>Plans</H1>
      <Muted>{quick.tryTier ? 'Demo: plans act as live so you can see what\'s free and what\'s paid. Try each one.' : live ? 'Cancel any time in your app store settings.' : 'Plans switch on once Quick Dial has enough people. Until then everything here is free.'}</Muted>
      {PLANS.map((p) => (
        <Card key={p.tier} style={{ marginTop: 12, padding: 18, ...(p.tier === current ? { borderColor: colours.foil } : null) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text style={styles.planName}>{p.name}</Text><Text style={styles.planPrice}>{p.price}</Text>
          </View>
          {p.perks.map((perk) => <Text key={perk} style={styles.perk}>✦  {perk}</Text>)}
          {p.tier === current
            ? <Text style={[styles.perk, { color: colours.foil, marginTop: 10 }]}>Your plan</Text>
            : quick.tryTier && <Button kind={p.tier === 'free' ? 'quiet' : 'primary'} label={p.tier === 'free' ? 'Switch to free (demo)' : `Try ${p.name} (demo)`}
                onPress={() => { quick.tryTier!(p.tier); play('reward', 0.6); }} style={{ marginTop: 12 }} />}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  kicker: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 6 },
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  big: { color: colours.text, fontFamily: serif, fontSize: 28, marginTop: 8 },
  bars: { alignSelf: 'stretch', marginTop: 8 },
  barLabel: { color: colours.slate, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  barValue: { color: colours.text, fontFamily: serif, fontSize: 18 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colours.line, marginTop: 4, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colours.accent },
  tip: { color: colours.text, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowTitle: { color: colours.text, fontSize: 15, fontWeight: '600' },
  small: { fontSize: 12, lineHeight: 17 },
  back: { color: colours.slate, fontSize: 14, marginBottom: 12 },
  planName: { color: colours.text, fontFamily: serif, fontSize: 28 },
  planPrice: { color: colours.foil, fontSize: 14, fontWeight: '700' },
  perk: { color: colours.text, fontSize: 14, marginTop: 8 },
  danger: { color: colours.danger, fontSize: 14, fontWeight: '600' },
}));
