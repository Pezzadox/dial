// People who dialled you 70 or more. You see their note, never their number.
// Dial them back: 70 or more and it's a match.
import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { api, MATCH_THRESHOLD } from '../api';
import { ProfileDial } from '../components/ProfileDial';
import { Card, H1, Muted } from '../components/ui';
import { colours, serif, themed } from '../theme';
import { useData } from '../useData';

export function Likes({ onMatched }: { onMatched: (matchId: string) => void }) {
  const { data: likes } = useData(() => api.getIncomingLikes());
  if (!likes) return null;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <H1>Dialled you</H1>
      <Muted>These people dialled you {MATCH_THRESHOLD} or more. Dial them back to decide. You never see their number, and they never see yours.</Muted>
      {likes.length === 0 && <Muted style={{ marginTop: 24 }}>Nobody new yet. A good introduction video helps.</Muted>}
      {likes.map((l) => (
        <Card key={l.likeId} style={{ marginTop: 16, alignItems: 'center' }}>
          {!!l.comment && <Text style={styles.comment}>“{l.comment}”</Text>}
          <ProfileDial personId={l.person.id} name={l.person.firstName} age={l.person.age} photo={l.photo ?? undefined} size={180} withNote={false}
            onDone={({ matchId }) => { if (matchId) onMatched(matchId); }} />
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  comment: { color: colours.text, fontFamily: serif, fontSize: 20, lineHeight: 27, textAlign: 'center', marginBottom: 14 },
}));
