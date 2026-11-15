import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { api, type Me } from '../api';
import { CHAPTERS, chapterProgress } from '../core/economy';
import { Button, Card, H1, Muted } from '../components/ui';
import { DIAL_GRADIENT, colours, serif, themed } from '../theme';
import { useData } from '../useData';

const CHALLENGES: Record<string, string> = {
  voice_note: 'Send a voice note',
  ask_question: 'Ask someone a real question',
  specific_like: 'Dial someone up and leave a note',
  different_interests: 'Dial up someone with completely different interests',
  move_forward: 'Take a conversation up a level',
};

export function Progress({ me }: { me: Me }) {
  const { data: ledger } = useData(() => api.getLedger());
  const { data: challenges } = useData(() => api.getChallenges());
  const [local, setLocal] = useState(false);
  const { data: optedIn } = useData(() => api.getConsent('leaderboards'));
  const { data: board } = useData(() => api.getBoard(local), [local]);
  const [error, setError] = useState<string | null>(null);
  const claim = (code: string) => api.claimChallenge(code).then(() => setError(null)).catch((e) => setError(String(e?.message ?? e)));
  const p = chapterProgress(me.ink);
  const R = 74, C = 2 * Math.PI * R;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <H1>Progress</H1>
      <Card style={{ alignItems: 'center', marginTop: 8 }}>
        <View style={{ width: 172, height: 172, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={172} height={172} style={StyleSheet.absoluteFill}>
            <Circle cx={86} cy={86} r={R} stroke={colours.line} strokeWidth={8} fill="none" />
            <Defs>
              <LinearGradient id="inkRing" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={DIAL_GRADIENT[0]} /><Stop offset="0.5" stopColor={DIAL_GRADIENT[1]} /><Stop offset="1" stopColor={DIAL_GRADIENT[2]} />
              </LinearGradient>
            </Defs>
            {/* glow, then the line */}
            <Circle cx={86} cy={86} r={R} stroke={p.current.number >= 6 ? colours.foil : 'url(#inkRing)'} strokeOpacity={0.25} strokeWidth={18} fill="none" strokeLinecap="round"
              strokeDasharray={`${C * p.fraction} ${C}`} transform="rotate(-90 86 86)" />
            <Circle cx={86} cy={86} r={R} stroke={p.current.number >= 6 ? colours.foil : 'url(#inkRing)'} strokeWidth={8} fill="none" strokeLinecap="round"
              strokeDasharray={`${C * p.fraction} ${C}`} transform="rotate(-90 86 86)" />
          </Svg>
          <Text style={styles.ink}>{me.ink.toLocaleString('en-GB')}</Text>
          <Muted>Ink</Muted>
        </View>
        <Text style={styles.chapter}>Chapter {p.current.numeral}: {p.current.name}</Text>
        <Muted>{p.next ? `${p.inkToNext.toLocaleString('en-GB')} Ink to ${p.next.name}` : 'The final Chapter'}</Muted>
        <Muted style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>
          Ink is Dial's points. You earn it by replying, keeping good conversations going and meeting people. It moves you up Chapters and can never be bought.
        </Muted>
      </Card>

      <Text style={styles.section}>Challenges</Text>
      <Card>
        {(challenges ?? []).map((c) => {
          const label = CHALLENGES[c.code] ?? c.code;
          return (
            <View key={c.code} style={styles.challenge}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{label}</Text>
                <Muted style={{ fontSize: 12 }}>{c.period === 'day' ? 'Daily' : 'Weekly'} · {c.ink} Ink{c.period === 'day' ? ' · any one, once a day' : ''}</Muted>
              </View>
              {c.claimed ? <Muted>{c.period === 'day' ? 'Collected today' : 'Collected this week'}</Muted>
                : c.done ? <Button label="Claim" onPress={() => claim(c.code)} style={{ paddingVertical: 8 }} />
                : <Muted>Not yet</Muted>}
            </View>
          );
        })}
        {!!error && <Text style={{ color: colours.danger }}>{error}</Text>}
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Challenges are checked against what you actually did, so there is nothing to tick off by hand.</Muted>
      </Card>

      <Text style={styles.section}>This week's board</Text>
      <Card>
        <View style={styles.challenge}>
          <Text style={[styles.rowText, { flex: 1 }]}>Show me on the board</Text>
          <Switch value={!!optedIn} onValueChange={(v) => api.setConsent('leaderboards', v)} accessibilityLabel="Show me on the board"
            trackColor={{ true: colours.accent, false: colours.line }} />
        </View>
        {!optedIn ? <Muted>Boards are optional. If you join, others see only your first name, Chapter and this week's Ink.</Muted> : (
          <>
            <View style={[styles.challenge, { gap: 8 }]}>
              <Button kind={local ? 'quiet' : 'primary'} label="Everyone" onPress={() => setLocal(false)} style={{ flex: 1, paddingVertical: 8 }} />
              <Button kind={local ? 'primary' : 'quiet'} label="My city" onPress={() => setLocal(true)} style={{ flex: 1, paddingVertical: 8 }} />
            </View>
            {(board ?? []).map((r) => (
              <View key={r.rank + r.firstName} style={[styles.chapterRow, r.isMe && styles.meRow]}>
                <Text style={styles.rank}>{r.rank}</Text>
                <Text style={[styles.rowText, r.isMe && { fontWeight: '700' }]}>{r.firstName}</Text>
                <Text style={[styles.numeral, { color: CHAPTERS[r.chapter - 1]?.colour, width: 40 }]}>{CHAPTERS[r.chapter - 1]?.numeral}</Text>
                <Text style={styles.amount}>{r.ink}</Text>
              </View>
            ))}
            <Muted style={{ fontSize: 12, marginTop: 6 }}>Resets every Monday. Ranks Ink earned this week, not looks or popularity.</Muted>
          </>
        )}
      </Card>

      <Text style={styles.section}>Chapters</Text>
      <Card>
        {CHAPTERS.map((c) => (
          <View key={c.number} style={styles.chapterRow}>
            <Text style={[styles.numeral, { color: c.colour, opacity: me.ink >= c.ink ? 1 : 0.45 }]}>{c.numeral}</Text>
            <Text style={[styles.rowText, { opacity: me.ink >= c.ink ? 1 : 0.45 }]}>{c.name}</Text>
            <Muted>{c.ink.toLocaleString('en-GB')}</Muted>
          </View>
        ))}
      </Card>

      <Text style={styles.section}>Recent Ink</Text>
      <Card>
        {(ledger ?? []).slice(0, 12).map((l) => (
          <View key={l.id} style={styles.chapterRow}>
            <Text style={[styles.rowText, { flex: 1 }]}>{l.reason}</Text>
            <Text style={styles.amount}>+{l.amount}</Text>
          </View>
        ))}
        {ledger?.length === 0 && <Muted>Nothing yet. Reply to someone.</Muted>}
      </Card>
      <Muted style={{ marginTop: 12, fontSize: 12 }}>Ink is earned, never bought. Conversation Ink is capped each week so quality beats volume.</Muted>
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  ink: { color: colours.text, fontFamily: serif, fontSize: 40, fontVariant: ['lining-nums', 'tabular-nums'] },
  chapter: { color: colours.text, fontFamily: serif, fontSize: 22, marginTop: 14 },
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2.4, textTransform: 'uppercase', marginTop: 24, marginBottom: 10 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  numeral: { width: 34, fontFamily: serif, fontSize: 18 },
  rowText: { color: colours.text, fontSize: 15, flex: 1 },
  amount: { color: colours.good, fontWeight: '700', fontVariant: ['lining-nums', 'tabular-nums'] },
  challenge: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rank: { color: colours.slate, width: 24, fontVariant: ['lining-nums', 'tabular-nums'] },
  meRow: { backgroundColor: colours.accentTint, borderRadius: 10, paddingHorizontal: 8, marginHorizontal: -8 },
}));
