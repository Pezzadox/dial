// Sign-in and first profile, used only when the app is connected to Supabase.
import { DobInput } from '../components/DobInput';
import { ageOn, dobToIso } from '../core/dob';
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { supabaseApi } from '../api';
import { Button, H1, Muted } from '../components/ui';
import { colours, radius, serif, themed } from '../theme';

const GENDERS = ['woman', 'man', 'non-binary'];

export function SignIn({ needsProfile, onDone }: { needsProfile: boolean; onDone: () => void }) {
  const client = supabaseApi!.client;
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false);
  const [name, setName] = useState(''); const [birth, setBirth] = useState(''); const [gender, setGender] = useState('woman');
  const [interested, setInterested] = useState<string[]>(['man']);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: any) => setError(String(e?.message ?? e));

  const sendCode = async () => { const { error } = await client.auth.signInWithOtp({ email: email.trim() }); if (error) fail(error); else { setSent(true); setError(null); } };
  const verify = async () => { const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' }); if (error) fail(error); else onDone(); };
  const createProfile = async () => {
    const user = (await client.auth.getUser()).data.user; if (!user) return fail('Please sign in again');
    const iso = dobToIso(birth);
    if (!iso) return fail('Enter your date of birth as DD/MM/YYYY');
    if (ageOn(iso) < 18) return fail('Dial is for over-18s only');
    // The database refuses anyone under 18; a full age check provider is added before launch.
    const { error } = await client.from('profiles').insert({ id: user.id, first_name: name.trim(), birth_date: iso, gender, interested_in: interested, onboarded: true });
    if (error) fail(error.message.includes('check') ? 'Dial is for people aged 18 and over.' : error); else onDone();
  };

  return (
    <View style={styles.page}>
      <Text style={{ color: colours.text, fontFamily: serif, fontSize: 72 }}>dial</Text>
      <Muted style={{ letterSpacing: 2.4, textTransform: 'uppercase', fontSize: 11 }}>The match is only the beginning</Muted>
      {!needsProfile ? (
        <View style={{ marginTop: 28, gap: 10 }}>
          <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colours.slate} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          {sent && <TextInput style={styles.input} placeholder="Code from your email" placeholderTextColor={colours.slate} keyboardType="number-pad" value={code} onChangeText={setCode} />}
          <Button label={sent ? 'Sign in' : 'Email me a code'} onPress={sent ? verify : sendCode} />
        </View>
      ) : (
        <View style={{ marginTop: 28, gap: 10 }}>
          <TextInput style={styles.input} placeholder="First name" placeholderTextColor={colours.slate} value={name} onChangeText={setName} />
          <DobInput value={birth} onChange={setBirth} style={styles.input} />
          <Muted>I am a</Muted>
          <View style={styles.row}>{GENDERS.map((g) => <Button key={g} kind={gender === g ? 'primary' : 'quiet'} label={g} onPress={() => setGender(g)} style={{ flex: 1 }} />)}</View>
          <Muted>I'd like to meet</Muted>
          <View style={styles.row}>{GENDERS.map((g) => (
            <Button key={g} kind={interested.includes(g) ? 'primary' : 'quiet'} label={g} style={{ flex: 1 }}
              onPress={() => setInterested(interested.includes(g) ? interested.filter((x) => x !== g) : [...interested, g])} />))}</View>
          <Button label="Create my profile" onPress={createProfile} disabled={!name.trim() || interested.length === 0} />
        </View>
      )}
      {!!error && <Text style={{ color: colours.danger, marginTop: 12 }}>{error}</Text>}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  page: { flex: 1, padding: 24, justifyContent: 'center' },
  input: { backgroundColor: colours.surface, borderRadius: radius.control, borderWidth: 1, borderColor: colours.line, color: colours.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  row: { flexDirection: 'row', gap: 8 },
}));
