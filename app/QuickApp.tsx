// Quick Dial: the streamlined Dial. Splash → three cards → one setup screen → dial.
// Each round: pick one of ten circles and dial their five. After three rounds, your scorecard.
import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabaseApi } from './src/api';
import { Ambient } from './src/components/Ambient';
import { SignIn } from './src/screens/SignIn';
import { initSound } from './src/sound';
import { colours, themed } from './src/theme';
import { useData } from './src/useData';
import { api } from './src/api';
import { quick } from './src/quick/api';
import { QD, type QPerson } from './src/quick/core';
import { Dialer } from './src/quick/Dialer';
import { Preview } from './src/quick/Preview';
import { QuickIntro, QuickSetup, QuickSplash } from './src/quick/Onboarding';
import { Chats, Deck, PushBanner, Scorecard } from './src/quick/Screens';
import { useQuick } from './src/quick/useQuick';
import { You } from './src/quick/You';
import { registerForPush } from './src/quick/push';

type Tab = 'Dial' | 'Card' | 'Chats' | 'You';
const ICONS: Record<Tab, React.ComponentProps<typeof Feather>['name']> = { Dial: 'disc', Card: 'bar-chart-2', Chats: 'message-circle', You: 'user' };
const INTRO_KEY = 'quickdial.intro';
const MAX_WIDTH = 480;

export default function QuickApp() {
  const { width } = useWindowDimensions();
  const column = Math.min(width, MAX_WIDTH);
  const [fontsLoaded] = useFonts({ CormorantGaramond_500Medium_Italic, ...Feather.font });
  const [phase, setPhase] = useState<'splash' | 'intro' | 'setup' | 'app'>('splash');
  const [seenIntro, setSeenIntro] = useState(false);
  const [tab, setTab] = useState<Tab>('Dial');
  const [tabReset, setTabReset] = useState(0);   // tapping the tab you're on goes back to its main screen
  const [dialling, setDialling] = useState<QPerson | null>(null);
  const [browsing, setBrowsing] = useState<{ people: QPerson[]; index: number } | null>(null);
  const [openChat, setOpenChat] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(!supabaseApi);
  const { data: today } = useQuick(() => quick.getToday(), [signedIn]);
  const { data: me, reload } = useData(() => (supabaseApi ? api.getMe() : Promise.resolve(undefined)), [signedIn]);

  useEffect(() => { initSound(); AsyncStorage.getItem(INTRO_KEY).then((v) => setSeenIntro(v === '1')).catch(() => {}); }, []);
  useEffect(() => {
    if (!supabaseApi) return;
    supabaseApi.client.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabaseApi.client.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { if (signedIn && supabaseApi) registerForPush((id) => { setTab('Chats'); setOpenChat(id); }); }, [signedIn]);

  const afterSplash = async () => {
    const p = await quick.getProfile().catch(() => null);
    setPhase(!seenIntro ? 'intro' : p && p.photos.length >= QD.perPerson ? 'app' : 'setup');
  };
  const afterIntro = async () => {
    AsyncStorage.setItem(INTRO_KEY, '1').catch(() => {}); setSeenIntro(true);
    const p = await quick.getProfile().catch(() => null);
    setPhase(p && p.photos.length >= QD.perPerson ? 'app' : 'setup');
  };
  const goChat = (id: string) => { setDialling(null); setBrowsing(null); setTab('Chats'); setOpenChat(id || null); };
  // After each person: back to a fresh ten, or to the scorecard once today's rounds are done.
  const nextRound = () => {
    setDialling(null); setBrowsing(null);
    quick.getToday().then((t) => { if (t.used >= t.allowance) setTab('Card'); }).catch(() => {});
  };

  let body: React.ReactNode = null;
  if (phase === 'splash') body = <QuickSplash onDone={afterSplash} />;
  else if (phase === 'intro') body = <QuickIntro onDone={afterIntro} />;
  else if (!signedIn) body = <SignIn brand="Quick Dial" needsProfile={false} onDone={reload} />;
  else if (supabaseApi && me === null) body = <SignIn brand="Quick Dial" needsProfile onDone={reload} />;
  else if (phase === 'setup') body = <QuickSetup onDone={() => setPhase('app')} />;
  else body = (
    <>
      {quick.mode === 'demo' && <Text style={styles.demo}>Quick Dial demo · invented people · nothing saved</Text>}
      <View style={{ flex: 1 }}>
        {tab === 'Dial' && <Deck today={today} width={column} onPick={(people, index) => setBrowsing({ people, index })} onCard={() => setTab('Card')} />}
        {tab === 'Card' && <Scorecard onMore={() => setTab('Dial')} onChat={goChat} />}
        {tab === 'Chats' && <Chats openId={openChat} setOpenId={setOpenChat} />}
        {tab === 'You' && <You key={tabReset} width={column} onLeave={() => { setTab('Dial'); setPhase('splash'); }} />}
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['Dial', 'Card', 'Chats', 'You'] as Tab[]).map((t) => (
          <Pressable key={t} onPress={() => { if (t === tab) { setTabReset((n) => n + 1); setOpenChat(null); } setTab(t); if (t !== 'Chats') setOpenChat(null); }} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
            <Feather name={ICONS[t]} size={20} color={tab === t ? colours.accent : colours.slate} />
            <Text style={[styles.tabText, tab === t && { color: colours.accent }]}>{t === 'Card' ? 'Scorecard' : t}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );

  if (!fontsLoaded) return <View style={styles.root} />;
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.root}>
        <Ambient />
        <StatusBar style="light" />
        <View style={[styles.column, { width: column }]}>{body}</View>
      </SafeAreaView>
      {browsing && !dialling && <Preview people={browsing.people} start={browsing.index} onClose={() => setBrowsing(null)} onChoose={(p) => setDialling(p)} />}
      {dialling && <Dialer key={dialling.id} person={dialling} round={(today?.used ?? 0) + 1} rounds={today?.allowance ?? QD.rounds} onClose={() => setDialling(null)} onNext={nextRound} onChat={() => goChat(dialling.id)} />}
      {phase === 'app' && <PushBanner onOpen={goChat} activeChat={tab === 'Chats' ? openChat : null} />}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.bg },
  column: { flex: 1, alignSelf: 'center' },
  demo: { color: colours.slate, fontSize: 10, letterSpacing: 2, textAlign: 'center', textTransform: 'uppercase', paddingTop: 6 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colours.line, paddingTop: 8, paddingBottom: 10 },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabText: { color: colours.slate, fontSize: 10, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
}));
