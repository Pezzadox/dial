import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api, type Match } from '../api';
import { ECONOMY, LEVEL_NAMES } from '../core/economy';
import { DatesPanel } from '../components/DatesPanel';
import { GamePanel, GamePicker } from '../components/GamePanel';
import { IdeasTray } from '../components/IdeasTray';
import { SafetySheet } from '../components/SafetySheet';
import { MediaTile } from '../components/MediaTile';
import { Button, H1, LevelLine, Muted } from '../components/ui';
import Feather from '@expo/vector-icons/Feather';
import { colours, radius, serif, themed } from '../theme';
import { useData } from '../useData';

const KIND_CLOSES = ["Lovely chatting. I don't think we're a match, but good luck!", "I've enjoyed this, but I'm going to step back. Take care!"];

export function Connections({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const { data: matches } = useData(() => api.getMatches());
  // While a report or block is being made, keep the chat on screen so the confirmation can be read.
  const [holding, setHolding] = useState<string | null>(null);
  if (!matches) return null;
  const current = matches.find((m) => m.id === openId);
  if (current && (current.status !== 'closed' || holding === current.id))
    return <Chat match={current} onBack={() => { setHolding(null); setOpenId(null); }} onHold={(h) => setHolding(h ? current.id : null)} />;

  const live = matches.filter((m) => m.status === 'open' || m.status === 'queued');
  const open = live.filter((m) => m.status === 'open').length;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <H1>Connections</H1>
      <Muted>{open} of {ECONOMY.openConversationSlots} conversation slots in use. Close one kindly to make room.</Muted>
      {live.length === 0 && <Muted style={{ marginTop: 24 }}>No conversations yet. Like something specific on Discover.</Muted>}
      {live.map((m) => (
        <Pressable key={m.id} onPress={() => m.status === 'open' && setOpenId(m.id)} style={styles.row} accessibilityRole="button">
          <View style={styles.avatar}>{m.person.media[0] && <MediaTile media={m.person.media[0]} width={52} height={52} small />}</View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowName}>{m.person.firstName}</Text>
            <Muted>{m.status === 'queued' ? 'Waiting for a free slot' : m.lastMessage ?? `Level ${m.level}: ${LEVEL_NAMES[m.level]}`}</Muted>
            <View style={{ marginTop: 8 }}><LevelLine level={m.level} /></View>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function Chat({ match, onBack, onHold }: { match: Match; onBack: () => void; onHold: (hold: boolean) => void }) {
  const { data: messages } = useData(() => api.getMessages(match.id), [match.id]);
  const [text, setText] = useState('');
  const [closing, setClosing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [safety, setSafety] = useState<null | 'menu' | 'report'>(null);
  const [planning, setPlanning] = useState(false);
  const [venue, setVenue] = useState<string | undefined>(undefined);
  const [ideas, setIdeas] = useState(false);
  const [picking, setPicking] = useState(false);
  const { data: games } = useData(() => api.getGames(match.id), [match.id]);
  const shownGames = (games ?? []).slice(0, 2).reverse();
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const run = (p: Promise<unknown>) => p.then(() => setError(null)).catch((e) => setError(String(e?.message ?? e)));
  const send = () => { const body = text.trim(); if (!body) return; setText(''); run(api.sendMessage(match.id, body)); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.chatHeader}>
        <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}><Text style={styles.back}><Feather name="chevron-left" size={14} color={colours.slate} /> Back</Text></Pressable>
        <Text style={styles.chatName}>{match.person.firstName}</Text>
        <Pressable onPress={() => { setMenu(!menu); setClosing(false); }} accessibilityRole="button" accessibilityLabel="More options" hitSlop={12}>
          <Feather name="more-horizontal" size={20} color={colours.text} />
        </Pressable>
      </View>
      {menu && (
        <View style={styles.menu}>
          <Pressable style={styles.menuItem} onPress={() => { setMenu(false); setClosing(true); }} accessibilityRole="button"><Feather name="feather" size={15} color={colours.text} /><Text style={styles.menuText}>Close kindly</Text></Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenu(false); onHold(true); setSafety('report'); }} accessibilityRole="button"><Feather name="flag" size={15} color={colours.text} /><Text style={styles.menuText}>Report {match.person.firstName}</Text></Pressable>
          <Pressable style={styles.menuItem} onPress={() => { setMenu(false); onHold(true); setSafety('menu'); }} accessibilityRole="button"><Feather name="slash" size={15} color={colours.danger} /><Text style={[styles.menuText, { color: colours.danger }]}>Block {match.person.firstName}</Text></Pressable>
        </View>
      )}
      {safety && <SafetySheet person={match.person} start={safety} onCancel={() => { setSafety(null); onHold(false); }} onDone={(blocked) => { setSafety(null); if (blocked) onBack(); else onHold(false); }} />}
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        <LevelLine level={match.level} />
        <Muted style={{ fontSize: 12, marginTop: 6 }}>Level {match.level}: {LEVEL_NAMES[match.level]}</Muted>
      </View>
      {closing && (
        <View style={styles.closeSheet}>
          <Muted>Pick a note. It frees a slot for both of you and costs nothing.</Muted>
          {KIND_CLOSES.map((note) => <Button key={note} kind="quiet" label={note} style={{ marginTop: 8 }} onPress={() => { run(api.closeMatch(match.id, note)); onBack(); }} />)}
        </View>
      )}
      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}>
        {(messages ?? []).map((m) => (
          <View key={m.id} style={[styles.bubble, m.mine ? styles.mine : styles.theirs]}>
            <Text style={{ color: m.mine ? colours.onAccent : colours.text, fontSize: 15 }}>{m.kind === 'voice' ? <><Feather name="mic" size={14} color={m.mine ? colours.onAccent : colours.text} />{'  '}</> : null}{m.body}</Text>
          </View>
        ))}
        {messages?.length === 0 && <Muted>You matched. Say something specific about what you liked.</Muted>}
        {match.level >= 5 && !planning && <Muted style={styles.ready}>You both said you'd meet. Plan a date?</Muted>}
        <View style={{ marginTop: 8 }}>
          {shownGames.map((g) => <GamePanel key={g.id} game={g} theirName={match.person.firstName} onError={setError}
            onPlanDate={(v) => { setVenue(`${v}, `); setPlanning(true); }} />)}
          {picking && <GamePicker onCancel={() => setPicking(false)} onPick={(k) => { setPicking(false); run(api.startGame(match.id, k)); }} />}
        </View>
        <View style={{ marginHorizontal: -16, marginTop: 8 }}>
          <DatesPanel matchId={match.id} name={match.person.firstName} planning={planning} initialVenue={venue} onClosePlanner={() => { setPlanning(false); setVenue(undefined); }} />
        </View>
      </ScrollView>
      {!!error && <Text style={{ color: colours.danger, paddingHorizontal: 16 }}>{error}</Text>}
      {ideas && <IdeasTray matchId={match.id} level={match.level} onClose={() => setIdeas(false)} onPick={(t) => { setText(t); setIdeas(false); }} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tools}>
        <Button kind={ideas ? 'primary' : 'quiet'} label="✦ Reply ideas" onPress={() => setIdeas(!ideas)} style={styles.tool} />
        <Button kind="quiet" label="Play a game" onPress={() => setPicking(true)} style={styles.tool} />
        <Button kind="quiet" label="Plan a date" onPress={() => setPlanning(true)} style={styles.tool} />
        <Button kind="quiet" label={match.iWantToMeet ? "You'd meet" : "I'd meet"} disabled={match.iWantToMeet} onPress={() => run(api.readyToMeet(match.id))} style={styles.tool} />
        <Button kind="quiet" label="Voice note" onPress={() => run(api.sendMessage(match.id, null, 'voice'))} style={styles.tool} />
      </ScrollView>
      <View style={styles.composer}>
        <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={colours.slate}
          style={styles.input} onSubmitEditing={send} returnKeyType="send" accessibilityLabel="Message" />
        <Button label="Send" onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: colours.surface, borderRadius: radius.card, padding: 14, marginTop: 12, borderWidth: 1, borderColor: colours.line },
  avatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', backgroundColor: colours.surfaceRaised },
  rowName: { color: colours.text, fontFamily: serif, fontSize: 20 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  chatName: { color: colours.text, fontFamily: serif, fontSize: 22 },
  back: { color: colours.slate, fontSize: 14 },
  bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 11 },
  mine: { alignSelf: 'flex-end', backgroundColor: colours.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colours.surfaceRaised },
  menu: { marginHorizontal: 16, marginBottom: 8, borderRadius: radius.card, backgroundColor: colours.surfaceRaised, borderWidth: 1, borderColor: colours.line, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.line },
  menuText: { color: colours.text, fontSize: 15 },
  closeSheet: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: radius.card, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line },
  tools: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  tool: { paddingVertical: 9, paddingHorizontal: 14 },
  ready: { textAlign: 'center', color: colours.foil, marginTop: 8 },
  composer: { flexDirection: 'row', gap: 8, padding: 16, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
}));
