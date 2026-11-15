import React, { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Feather from '@expo/vector-icons/Feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CormorantGaramond_500Medium_Italic } from '@expo-google-fonts/cormorant-garamond/500Medium_Italic';
import { api, supabaseApi } from './src/api';
import { Connections } from './src/screens/Connections';
import { Discover } from './src/screens/Discover';
import { Likes } from './src/screens/Likes';
import { Profile } from './src/screens/Profile';
import { Progress } from './src/screens/Progress';
import { SignIn } from './src/screens/SignIn';
import { colours, onThemeChange, setTheme, themeName, themed, type ThemeName } from './src/theme';
import { useData } from './src/useData';
import { Ambient } from './src/components/Ambient';
import { DialStageProvider } from './src/components/DialStage';
import { initSound, play } from './src/sound';
import { Splash, Walkthrough } from './src/screens/Intro';
import { AboutEditor } from './src/screens/AboutEditor';

type Tab = 'Discover' | 'Likes' | 'Connections' | 'Progress' | 'Profile';
const TABS: Tab[] = ['Discover', 'Likes', 'Connections', 'Progress', 'Profile'];
const TAB_LABEL: Record<Tab, string> = { Discover: 'Discover', Likes: 'Dialled you', Connections: 'Chats', Progress: 'Progress', Profile: 'Profile' };
const ICONS: Record<Tab, React.ComponentProps<typeof Feather>['name']> = {
  Discover: 'compass', Likes: 'heart', Connections: 'message-circle', Progress: 'bookmark', Profile: 'user',
};
const THEME_KEY = 'dial.theme.v2';
const ONBOARDED_KEY = 'dial.onboarded';
const SETUP_KEY = 'dial.setup';
const MAX_WIDTH = 480;

export default function App() {
  const { width } = useWindowDimensions();
  const column = Math.min(width, MAX_WIDTH);
  const [tab, setTab] = useState<Tab>('Discover');
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(api.mode === 'demo');
  const { data: me, reload } = useData(() => api.getMe(), [signedIn]);
  // A rising chime for a match; a sparkle whenever Ink goes up, for any reason.
  const lastInk = React.useRef<number | null>(null);
  useEffect(() => { initSound(); }, []);
  useEffect(() => {
    if (me?.ink == null) return;
    if (lastInk.current != null && me.ink > lastInk.current) play('reward');
    lastInk.current = me.ink;
  }, [me?.ink]);
  const matched = (id: string) => { play('match'); setOpenMatch(id); setTab('Connections'); };
  const [fontsLoaded] = useFonts({ CormorantGaramond_500Medium_Italic, ...Feather.font });
  const [theme, setThemeState] = useState<ThemeName>(themeName());
  // Intro on every launch; the walkthrough only until someone has finished or skipped it once.
  // First time: walkthrough, then "About you", then the app. Profile can replay the walkthrough.
  const [phase, setPhase] = useState<'splash' | 'walkthrough' | 'setup' | 'app'>('splash');
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [setupDone, setSetupDone] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY).then((v) => setOnboarded(v === '1')).catch(() => setOnboarded(false));
    AsyncStorage.getItem(SETUP_KEY).then((v) => setSetupDone(v === '1')).catch(() => {});
  }, []);
  const afterSplash = () => setPhase(onboarded ? (setupDone ? 'app' : 'setup') : 'walkthrough');
  const finishWalkthrough = () => { AsyncStorage.setItem(ONBOARDED_KEY, '1').catch(() => {}); setOnboarded(true); setPhase(setupDone ? 'app' : 'setup'); };
  const finishSetup = () => { AsyncStorage.setItem(SETUP_KEY, '1').catch(() => {}); setSetupDone(true); setTab('Profile'); setPhase('app'); };

  // Remember the chosen theme, and redraw everything when it changes.
  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((t) => { if (t === 'paper' || t === 'ink') setTheme(t); }).catch(() => {});
    return onThemeChange((t) => { setThemeState(t); AsyncStorage.setItem(THEME_KEY, t).catch(() => {}); });
  }, []);

  useEffect(() => {
    if (!supabaseApi) return;
    supabaseApi.client.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabaseApi.client.auth.onAuthStateChange((_e, session) => setSignedIn(!!session));
    return () => data.subscription.unsubscribe();
  }, []);

  let body: React.ReactNode = null;
  if (phase === 'splash') body = <Splash onDone={afterSplash} />;
  else if (phase === 'walkthrough') body = <Walkthrough onDone={finishWalkthrough} />;
  else if (!signedIn) body = <SignIn needsProfile={false} onDone={reload} />;
  else if (me === null) body = <SignIn needsProfile onDone={reload} />;
  else if (me && phase === 'setup') body = <AboutEditor me={me} firstTime onDone={finishSetup} />;
  else if (me) {
    body = (
      <>
        {api.mode === 'demo' && <Text style={styles.demo}>Demo · invented people · nothing saved</Text>}
        <View style={{ flex: 1 }}>
          {tab === 'Discover' && <Discover me={me} width={column - 32} onMatched={matched} />}
          {tab === 'Likes' && <Likes onMatched={matched} />}
          {tab === 'Connections' && <Connections openId={openMatch} setOpenId={setOpenMatch} />}
          {tab === 'Progress' && <Progress me={me} />}
          {tab === 'Profile' && <Profile me={me} width={column - 32} onReplayIntro={() => setPhase('walkthrough')} />}
        </View>
        <View style={styles.tabs} accessibilityRole="tablist">
          {TABS.map((t) => (
            <Pressable key={t} onPress={() => { setTab(t); if (t !== 'Connections') setOpenMatch(null); }} style={styles.tab}
              accessibilityRole="tab" accessibilityState={{ selected: tab === t }}>
              <Feather name={ICONS[t]} size={20} color={tab === t ? colours.accent : colours.slate} />
              <Text style={[styles.tabText, tab === t && { color: colours.accent }]}>{TAB_LABEL[t]}</Text>
            </Pressable>
          ))}
        </View>
      </>
    );
  }

  if (!fontsLoaded) return <View style={styles.root} />;
  return (
    <DialStageProvider>
    <SafeAreaView style={styles.root} key={theme}>
      <Ambient />
      <StatusBar style={theme === 'ink' ? 'light' : 'dark'} />
      <View style={[styles.column, { width: column }]}>{body}</View>
    </SafeAreaView>
    </DialStageProvider>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colours.bg, alignItems: 'center' },
  column: { flex: 1 },
  demo: { color: colours.slate, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center', paddingVertical: 6 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colours.line, backgroundColor: colours.tabBar },
  tab: { flex: 1, paddingTop: 10, paddingBottom: 12, alignItems: 'center', gap: 4 },
  tabText: { color: colours.slate, fontSize: 9, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
}));
