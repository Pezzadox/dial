// Quick Dial's other screens: the deck of ten circles, the scorecard, chats, and the push banner.
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Feather from '@expo/vector-icons/Feather';
import { Logo } from '../components/Logo';
import { SafetySheet } from '../components/SafetySheet';
import { Button, Card, H1, Muted } from '../components/ui';
import { dialWord } from '../core/gauge';
import { play } from '../sound';
import { colours, radius, serif, themed } from '../theme';
import { quick, showPurchases, type QNotice } from './api';
import { QD, STATUS_LABEL, cardStats, friendly, isUnlimited, milesLabel, openers, status, until, type QPerson } from './core';
import type { QToday } from './api';
import { useQuick } from './useQuick';
import { PersonCircle } from './Visual';

// ---------------------------------------------------------------------------
// The deck: ten circles in a 3-2-3-2 pattern. Tap one to dial them.
// ---------------------------------------------------------------------------
export function Deck({ today, width, onPick, onCard }: { today: QToday | undefined; width: number; onPick: (people: QPerson[], index: number) => void; onCard: () => void }) {
  const { data: deck } = useQuick(() => quick.getDeck(), [today?.used]);
  const [buying, setBuying] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const round = (today?.used ?? 0) + 1;
  const total = today?.allowance ?? QD.rounds;
  if (today && today.used >= today.allowance) return (
    <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40, alignItems: 'center' }}>
      <Text style={styles.kicker}>Done for today</Text>
      <Text style={styles.doneTitle}>That's your {today.allowance}</Text>
      <Muted style={{ textAlign: 'center', maxWidth: 320 }}>Fresh faces in {until(today.resetsAt)}. Fewer, better Dials make every mutual mean more.</Muted>
      <View style={styles.roundDots}>{Array.from({ length: today.allowance }, (_, k) => <View key={k} style={[styles.roundDot, styles.roundDone, { width: 40, flex: 0 }]} />)}</View>
      <Button label="See your scorecard" onPress={onCard} style={{ alignSelf: 'stretch', marginTop: 20 }} />
      {showPurchases() && <Button kind="quiet" label={buying ? 'One sec…' : quick.mode === 'demo' ? 'Unlock one more round (premium, free in demo)' : 'Unlock one more round'} style={{ alignSelf: 'stretch', marginTop: 10 }}
        onPress={async () => { setBuying(true); setNote(null); try { await quick.buyExtraRound(); play('reward', 0.6); } catch (e) { setNote(friendly(e)); } finally { setBuying(false); } }} />}
      {!!note && <Muted style={{ marginTop: 10, textAlign: 'center' }}>{note}</Muted>}
    </ScrollView>
  );
  const size = Math.min(104, (width - 40) / 3.2);
  const rows: QPerson[][] = [];
  if (deck) { let k = 0; for (const n of [3, 2, 3, 2]) { rows.push(deck.slice(k, k + n)); k += n; } }
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.kicker}>{isUnlimited(total) ? `Round ${round} · Gold, unlimited` : `Round ${round} of ${total} today`}</Text>
      <H1>Pick one</H1>
      <Muted>Tap a circle to see their photos, video and stories. Browse all ten, then choose who to dial. ✦ means they dialled you high.</Muted>
      <View style={styles.roundDots}>
        {Array.from({ length: isUnlimited(total) ? 0 : total }, (_, k) => <View key={k} style={[styles.roundDot, k < round - 1 && styles.roundDone, k === round - 1 && styles.roundNow]} />)}
      </View>
      {!!(deck as any)?.hiddenAdmirers && (
        <Text style={styles.admirers}>✦ Someone in this ten dialled you high.{showPurchases() ? ' Quick+ shows who.' : ''}</Text>
      )}
      {deck?.length === 0 && <Muted style={{ textAlign: 'center', marginTop: 40 }}>You've dialled everyone nearby. New people join every day.</Muted>}
      <View style={{ marginTop: 10 }}>
        {rows.map((row, r) => (
          <View key={r} style={[styles.deckRow, { marginTop: r ? -size * 0.12 : 0 }]}>
            {row.map((p) => (
              <Pressable key={p.id} onPress={() => { play('open', 0.6); onPick(deck!, deck!.indexOf(p)); }} style={({ pressed }) => [styles.deckItem, { width: size + 16 }, pressed && { transform: [{ scale: 0.95 }] }]}
                accessibilityRole="button" accessibilityLabel={`See ${p.firstName}, ${p.age}${p.miles != null ? `, ${milesLabel(p.miles)} away` : ''}${p.dialledYou ? ', dialled you high' : ''}`}>
                <View>
                  <PersonCircle look={p.look} photo={p.media[0]} frames={p.booth} size={size} glow delay={(r * 3 + row.indexOf(p)) * 230} />
                  {p.dialledYou && <Text style={styles.spark} accessibilityLabel="Dialled you high">✦</Text>}
                </View>
                <Text style={styles.deckName} numberOfLines={1}>{p.firstName}, {p.age}</Text>
                {p.miles != null && <Text style={styles.deckMiles}>{milesLabel(p.miles)}</Text>}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// The scorecard: what your Dials say, and who you're dialled in with.
// ---------------------------------------------------------------------------
export function Scorecard({ onMore, onChat }: { onMore: () => void; onChat: (id: string) => void }) {
  const { data: rows } = useQuick(() => quick.getCard());
  if (!rows) return null;
  if (!rows.length) return (
    <View style={{ padding: 24 }}>
      <H1>Your card</H1>
      <Muted>Dial a few people and your scorecard builds itself here.</Muted>
      <Button label="Start dialling" onPress={onMore} style={{ marginTop: 20 }} />
    </View>
  );
  const s = cardStats(rows);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <Text style={styles.kicker}>Your Quick Dial card</Text>
      <H1>{s.mutuals ? `${s.mutuals} dialled in` : 'Your card'}</H1>
      <View style={styles.tiles}>
        <Tile label="Dialled" value={String(s.count)} />
        <Tile label="Your average" value={String(s.average)} />
        <Tile label="Dialled in" value={String(s.mutuals)} gold />
      </View>
      <Card style={{ marginTop: 12, padding: 16 }}>
        <Text style={styles.cardTitle}>You're a {s.style.toLowerCase()} dialler</Text>
        <Muted style={{ fontSize: 13, marginTop: 4 }}>
          {s.style === 'Generous' ? 'You see the best in people. Your high Dials mean more when they\'re rarer, so trust your gut.' :
           s.style === 'Selective' ? 'You know what you like. When you dial someone high, it counts.' : 'A good spread: you dial with your head and your heart.'}
          {` Looks average ${s.looksAvg}, vibe ${s.vibeAvg}, personality ${s.personalityAvg}: ${s.leansOn === 'personality' ? 'personality wins you over' : s.leansOn === 'looks' ? 'you\'re a visual person' : 'you weigh it all up'}.`}
        </Muted>
        {s.drawnTo.length > 0 && <Muted style={{ fontSize: 13, marginTop: 8 }}>You dial high for: <Text style={{ color: colours.text }}>{s.drawnTo.join(', ')}</Text></Muted>}
      </Card>

      <Text style={styles.section}>Everyone you dialled</Text>
      {rows.map((r) => {
        const st = status(r);
        return (
          <Pressable key={r.id} onPress={() => onChat(r.id)} style={[styles.row, st === 'mutual' && styles.rowMutual]} accessibilityRole="button"
            accessibilityLabel={`${r.firstName}, your Dial ${r.score}, ${STATUS_LABEL[st]}. Open chat`}>
            <PersonCircle look={r.look} size={52} score={r.score} glow={r.mutual} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowName}>{r.firstName}, {r.age}</Text>
              <Text style={[styles.status, st === 'mutual' && { color: colours.foil }]}>{STATUS_LABEL[st]}</Text>
              <Text style={styles.breakdown}>Looks {r.looks} · Vibe {r.vibe} · Personality {r.personality}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.rowScore}>{r.score}</Text>
              <Text style={styles.rowWord}>{dialWord(r.score)}</Text>
            </View>
          </Pressable>
        );
      })}
      <Muted style={{ fontSize: 12, textAlign: 'center', marginTop: 10 }}>Only you see your numbers. Nobody ever sees the score they were given.</Muted>
      <Button label="Dial another round" onPress={onMore} style={{ marginTop: 18 }} />
    </ScrollView>
  );
}

function Tile({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={[styles.tile, gold && { borderColor: colours.foil }]}>
      <Text style={[styles.tileValue, gold && { color: colours.foil }]}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chats: everyone you dialled or who dialled you. Dialled-in people first.
// ---------------------------------------------------------------------------
export function DropBanner() {
  const { data: drop } = useQuick(() => quick.getDrop());
  if (!drop) return null;
  const time = new Date(drop.at).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(':00', '');
  return (
    <View style={styles.drop} accessibilityLabel={`Tonight's drop at ${time}. ${drop.waiting} waiting`}>
      <Text style={styles.dropSpark}>✦</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.dropTitle}>Tonight's drop · {time}</Text>
        <Muted style={{ fontSize: 12 }}>{drop.waiting ? `${drop.waiting} new ${drop.waiting === 1 ? 'mutual' : 'mutuals'} waiting. In ${until(drop.at)}.` : 'Anyone who dials you back high while you\'re away arrives here at 8pm.'}</Muted>
      </View>
      {!!drop.waiting && quick.openDropNow && <Button label="Open now (demo)" onPress={() => quick.openDropNow!()} style={{ paddingVertical: 8, paddingHorizontal: 12 }} />}
    </View>
  );
}

export function Chats({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const { data: chats } = useQuick(() => quick.getChats());
  if (openId) return <Chat otherId={openId} onBack={() => setOpenId(null)} />;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <DropBanner />
      <H1>Chats</H1>
      <Muted>Anyone you dial can message you, and you them. Dialled in means you both dialled each other high.</Muted>
      {chats?.length === 0 && <Muted style={{ marginTop: 30, textAlign: 'center' }}>Nobody yet. Dial a few people and chats open up here.</Muted>}
      {(chats ?? []).map((c) => (
        <Pressable key={c.otherId} onPress={() => setOpenId(c.otherId)} style={[styles.row, c.mutual && styles.rowMutual]} accessibilityRole="button">
          <PersonCircle look={c.look} size={52} glow={c.mutual} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{c.firstName}{c.mutual ? '  ✦' : ''}</Text>
            <Text style={styles.status} numberOfLines={1}>{c.last ? `${c.lastFromMe ? 'You: ' : ''}${c.last}` : c.mutual ? 'Dialled in. Say hi!' : 'Open to chat'}</Text>
          </View>
          {!!c.last && !c.lastFromMe && <Text style={styles.yourTurn}>Your turn</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Chat({ otherId, onBack }: { otherId: string; onBack: () => void }) {
  const { data: messages } = useQuick(() => quick.getMessages(otherId), [otherId]);
  const { data: chats } = useQuick(() => quick.getChats());
  const { data: card } = useQuick(() => quick.getCard());
  const [text, setText] = useState('');
  const [safety, setSafety] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const chat = chats?.find((c) => c.otherId === otherId);
  const row = card?.find((r) => r.id === otherId);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages?.length]);
  if (!chat) return null;
  const waiting = !chat.mutual && !!messages?.some((m) => m.fromMe) && !messages?.some((m) => !m.fromMe);
  const send = async (body = text) => {
    if (!body.trim()) return;
    setError(null);
    try { await quick.send(otherId, body); setText(''); play('tap', 0.5); } catch (e) { setError(friendly(e)); }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.chatHead}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back"><Feather name="chevron-left" size={22} color={colours.text} /></Pressable>
        <PersonCircle look={chat.look} size={36} glow={chat.mutual} />
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{chat.firstName}</Text>
          <Text style={[styles.status, chat.mutual && { color: colours.foil }]}>{chat.mutual ? 'Dialled in ✦' : 'Open to chat'}</Text>
        </View>
        <Pressable onPress={() => setSafety(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Report or block"><Feather name="more-horizontal" size={20} color={colours.text} /></Pressable>
      </View>
      {safety && <SafetySheet person={{ id: otherId, firstName: chat.firstName }}
        actions={{ report: (r, d, b) => quick.report(otherId, r, d, b), block: () => quick.block(otherId) }}
        onCancel={() => setSafety(false)} onDone={(blocked) => { setSafety(false); if (blocked) onBack(); }} />}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {messages?.length === 0 && !chat.mutual && <Muted style={{ fontSize: 12, marginBottom: 6 }}>You're not dialled in yet, so it's one message until {chat.firstName} replies. Make it a good one.</Muted>}
        {messages?.length === 0 && (
          <View style={styles.openers}>
            <Text style={styles.openersTitle}>{chat.mutual ? `You both dialled high. Don't overthink it:` : 'Break the ice:'}</Text>
            {(row ? openers(row) : openers({ firstName: chat.firstName, scores: [] })).map((o) => (
              <Pressable key={o} onPress={() => send(o)} style={styles.opener} accessibilityRole="button" accessibilityLabel={`Send: ${o}`}>
                <Text style={styles.openerText}>{o}</Text><Feather name="send" size={14} color={colours.accent} />
              </Pressable>
            ))}
          </View>
        )}
        {(messages ?? []).map((m) => (
          <View key={m.id} style={[styles.bubble, m.fromMe ? styles.mine : styles.theirs]}>
            <Text style={[styles.bubbleText, m.fromMe && { color: colours.onAccent }]}>{m.body}</Text>
          </View>
        ))}
      </ScrollView>
      {waiting && <Muted style={styles.waiting}>Ball's in {chat.firstName}'s court. You can send another once they reply.</Muted>}
      {!!error && !waiting && <Text style={[styles.waiting, { color: colours.danger }]}>{error}</Text>}
      <View style={[styles.composer, waiting && { opacity: 0.45 }]} pointerEvents={waiting ? 'none' : 'auto'}>
        <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={colours.slate} style={styles.input}
          onSubmitEditing={() => send()} accessibilityLabel="Message" maxLength={1000} />
        <Button label="Send" onPress={() => send()} disabled={!text.trim()} style={{ paddingHorizontal: 18 }} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The push banner: drops in from the top like a phone notification. Tap to open the chat.
// ---------------------------------------------------------------------------
export function PushBanner({ onOpen, activeChat }: { onOpen: (id: string) => void; activeChat: string | null }) {
  const active = useRef(activeChat); active.current = activeChat;
  const [n, setN] = useState<QNotice | null>(null);
  const y = useRef(new Animated.Value(-140)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => quick.onNotice((note) => {
    if (note.withId === active.current && !note.title.includes('✦')) return;   // already reading that chat
    setN(note); play(note.title.includes('✦') ? 'match' : 'tap', 0.8);
    Animated.spring(y, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 7 }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(hide, 5200);
  }), []);
  const hide = () => Animated.timing(y, { toValue: -140, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  if (!n) return null;
  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY: y }] }]}>
      <Pressable onPress={() => { hide(); onOpen(n.withId); }} style={styles.bannerInner} accessibilityRole="button" accessibilityLabel={`${n.title}. ${n.body}. Open chat`}>
        <View style={styles.bannerIcon}><Logo size={30} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={styles.bannerApp}>QUICK DIAL</Text><Text style={styles.bannerApp}>now</Text>
          </View>
          <Text style={styles.bannerTitle} numberOfLines={1}>{n.title}</Text>
          <Text style={styles.bannerBody} numberOfLines={2}>{n.body}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  kicker: { color: colours.foil, fontSize: 11, fontWeight: '700', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 6 },
  roundDots: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 8 },
  roundDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colours.line },
  roundDone: { backgroundColor: colours.accent },
  roundNow: { backgroundColor: colours.foil },
  deckRow: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  deckItem: { alignItems: 'center', paddingVertical: 6 },
  spark: { position: 'absolute', top: -2, right: -2, color: '#08070F', backgroundColor: colours.foil, width: 26, height: 26, borderRadius: 13, textAlign: 'center', lineHeight: 26, fontSize: 14, overflow: 'hidden' },
  admirers: { color: colours.foil, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 4 },
  deckMiles: { color: colours.slate, fontSize: 10, marginTop: 1 },
  deckName: { color: colours.text, fontSize: 12, marginTop: 6, fontWeight: '600' },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tile: { flex: 1, borderRadius: 20, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface, paddingVertical: 14, alignItems: 'center' },
  tileValue: { color: colours.text, fontFamily: serif, fontSize: 36, fontVariant: ['lining-nums'] },
  tileLabel: { color: colours.slate, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  cardTitle: { color: colours.text, fontFamily: serif, fontSize: 22 },
  section: { color: colours.slate, fontWeight: '600', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginTop: 24, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 22, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface, marginTop: 8 },
  rowMutual: { borderColor: colours.foil },
  rowName: { color: colours.text, fontFamily: serif, fontSize: 20 },
  status: { color: colours.slate, fontSize: 12, marginTop: 2 },
  rowScore: { color: colours.text, fontFamily: serif, fontSize: 30, fontVariant: ['lining-nums'] },
  rowWord: { color: colours.slate, fontSize: 9, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  doneTitle: { color: colours.text, fontFamily: serif, fontSize: 40, textAlign: 'center', marginBottom: 6 },
  breakdown: { color: colours.slate, fontSize: 11, marginTop: 2 },
  drop: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: colours.foil, backgroundColor: colours.surface, marginBottom: 16 },
  dropSpark: { color: colours.foil, fontSize: 22 },
  dropTitle: { color: colours.text, fontSize: 14, fontWeight: '700' },
  yourTurn: { color: colours.onAccent, backgroundColor: colours.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  unread: { width: 9, height: 9, borderRadius: 5, backgroundColor: colours.accent },
  chatHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.line },
  chatName: { color: colours.text, fontFamily: serif, fontSize: 22 },
  openers: { gap: 8, marginBottom: 10 },
  openersTitle: { color: colours.foil, fontSize: 13, marginBottom: 2 },
  opener: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: colours.line, backgroundColor: colours.surface },
  openerText: { color: colours.text, fontSize: 14, flex: 1, lineHeight: 20 },
  bubble: { maxWidth: '80%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  mine: { alignSelf: 'flex-end', backgroundColor: colours.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colours.surfaceRaised },
  bubbleText: { color: colours.text, fontSize: 15, lineHeight: 21 },
  waiting: { fontSize: 12, textAlign: 'center', paddingHorizontal: 20, paddingVertical: 6 },
  composer: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colours.line },
  input: { flex: 1, backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 16, fontSize: 15 },
  banner: { position: 'absolute', top: 8, left: 10, right: 10, zIndex: 200, maxWidth: 460, alignSelf: 'center' },
  bannerInner: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 22, backgroundColor: 'rgba(30,27,46,0.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  bannerIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#08070F', alignItems: 'center', justifyContent: 'center' },
  bannerApp: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  bannerTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginTop: 2 },
  bannerBody: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 18 },
}));
