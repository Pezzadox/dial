// A game for two inside a chat: pick privately each round, see both picks once you've both chosen,
// and finish with something you made together.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { api, type Game } from '../api';
import { GAMES, gameResult, nextRound, type GameKind } from '../core/games';
import { play } from '../sound';
import { colours, radius, serif, themed } from '../theme';
import { Button, Muted } from './ui';

export function GamePicker({ onPick, onCancel }: { onPick: (kind: GameKind) => void; onCancel: () => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Play together</Text>
      {(Object.keys(GAMES) as GameKind[]).map((k) => (
        <View key={k} style={styles.option}>
          <Text style={styles.title}>{GAMES[k].title}</Text>
          <Muted style={{ fontSize: 13 }}>{GAMES[k].blurb}</Muted>
          <Button label={`Start ${GAMES[k].title.toLowerCase()}`} onPress={() => onPick(k)} style={{ marginTop: 10 }} />
        </View>
      ))}
      <Button kind="quiet" label="Not now" onPress={onCancel} />
    </View>
  );
}

export function GamePanel({ game, theirName, onPlanDate, onError }: { game: Game; theirName: string; onPlanDate: (venue: string) => void; onError: (e: string) => void }) {
  const round = nextRound(game.rounds, game.myPicks);
  const done = round == null;
  const revealed = game.rounds.map((r, i) => ({ r, i, a: game.myPicks[i], b: game.theirPicks[i] })).filter((x) => x.a != null);
  const result = gameResult(game.kind, game.rounds, game.myPicks, game.theirPicks, theirName);
  const bothDone = done && revealed.every((x) => x.b != null);
  const pick = (opt: number) => { play('tap', 0.6); api.playGame(game.id, round!, opt).catch((e) => onError(String(e?.message ?? e))); };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{GAMES[game.kind].title} · {Math.min(revealed.length, game.rounds.length)} of {game.rounds.length}</Text>
      {revealed.map(({ r, i, a, b }) => (
        <View key={i} style={styles.revealRow}>
          <Text style={styles.revealPrompt}>{r.prompt}</Text>
          <Text style={styles.reveal}>
            {b == null ? `You: ${r.options[a!]} · waiting for ${theirName}` : a === b ? `${r.options[a!]} · you both chose it` : `You: ${r.options[a!]} · ${theirName}: ${r.options[b]}`}
          </Text>
        </View>
      ))}
      {!done && (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.title}>{game.rounds[round!].prompt}</Text>
          <View style={styles.options}>
            {game.rounds[round!].options.map((o, k) => <Button key={o} kind="quiet" label={o} onPress={() => pick(k)} style={styles.chip} />)}
          </View>
          <Muted style={{ fontSize: 12, marginTop: 8 }}>{theirName} can't see your pick until they've chosen too.</Muted>
        </View>
      )}
      {bothDone && (
        <View style={styles.result}>
          <Text style={styles.headline}>{result.headline}</Text>
          {game.kind === 'build_a_date' && result.lines.map((l) => <Text key={l} style={styles.resultLine}>{l}</Text>)}
          {game.kind === 'build_a_date' && result.venue && <Button label="Plan this date" onPress={() => onPlanDate(result.venue!)} style={{ marginTop: 12 }} />}
        </View>
      )}
      {done && !bothDone && <Muted style={{ marginTop: 8 }}>All your picks are in. Waiting for {theirName}.</Muted>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  card: { marginBottom: 10, padding: 16, borderRadius: radius.card, backgroundColor: colours.surface, borderWidth: 1, borderColor: colours.line, gap: 6 },
  eyebrow: { color: colours.foil, fontSize: 10, fontWeight: '600', letterSpacing: 2.4, textTransform: 'uppercase', marginBottom: 4 },
  option: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colours.line, marginBottom: 6 },
  title: { color: colours.text, fontFamily: serif, fontSize: 22 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 13 },
  revealRow: { paddingVertical: 4 },
  revealPrompt: { color: colours.slate, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  reveal: { color: colours.text, fontSize: 14, marginTop: 2 },
  result: { marginTop: 10, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colours.line },
  headline: { color: colours.text, fontFamily: serif, fontSize: 24, marginBottom: 6 },
  resultLine: { color: colours.text, fontSize: 15, lineHeight: 22 },
}));
