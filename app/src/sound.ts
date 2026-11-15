// Dial's sound set. Soft and short, and saved for real moments: the Dial clicking up the
// scale as it climbs, a chime when you set it, a shimmer at 100, a rising chime for a match,
// a sparkle when you earn Ink. Members can switch sound off; phones in silent mode stay silent.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

const SOURCES = {
  tap: require('../assets/sounds/tap.wav'),
  open: require('../assets/sounds/open.wav'),
  lock: require('../assets/sounds/lock.wav'),
  full: require('../assets/sounds/full.wav'),
  match: require('../assets/sounds/match.wav'),
  reward: require('../assets/sounds/reward.wav'),
  intro: require('../assets/sounds/intro.wav'),
  tick_005: require('../assets/sounds/tick_005.wav'), tick_010: require('../assets/sounds/tick_010.wav'),
  tick_015: require('../assets/sounds/tick_015.wav'), tick_020: require('../assets/sounds/tick_020.wav'),
  tick_025: require('../assets/sounds/tick_025.wav'), tick_030: require('../assets/sounds/tick_030.wav'),
  tick_035: require('../assets/sounds/tick_035.wav'), tick_040: require('../assets/sounds/tick_040.wav'),
  tick_045: require('../assets/sounds/tick_045.wav'), tick_050: require('../assets/sounds/tick_050.wav'),
  tick_055: require('../assets/sounds/tick_055.wav'), tick_060: require('../assets/sounds/tick_060.wav'),
  tick_065: require('../assets/sounds/tick_065.wav'), tick_070: require('../assets/sounds/tick_070.wav'),
  tick_075: require('../assets/sounds/tick_075.wav'), tick_080: require('../assets/sounds/tick_080.wav'),
  tick_085: require('../assets/sounds/tick_085.wav'), tick_090: require('../assets/sounds/tick_090.wav'),
  tick_095: require('../assets/sounds/tick_095.wav'), tick_100: require('../assets/sounds/tick_100.wav'),
} as const;
export type SoundName = keyof typeof SOURCES;

const KEY = 'dial.sound';
let enabled = true;
let ready = false;
const players = new Map<SoundName, AudioPlayer>();
const listeners = new Set<(on: boolean) => void>();

export async function initSound() {
  if (ready) return;
  ready = true;
  try { enabled = (await AsyncStorage.getItem(KEY)) !== 'off'; } catch {}
  // Respect the phone's silent switch, and mix politely with whatever else is playing.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' } as any).catch(() => {});
}

export const soundOn = () => enabled;
export function setSoundOn(on: boolean) {
  enabled = on;
  AsyncStorage.setItem(KEY, on ? 'on' : 'off').catch(() => {});
  listeners.forEach((l) => l(on));
}
export function onSoundChange(l: (on: boolean) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function play(name: SoundName, volume = 1) {
  if (!enabled) return;
  try {
    let p = players.get(name);
    if (!p) { p = createAudioPlayer(SOURCES[name]); players.set(name, p); }
    p.volume = volume;
    p.seekTo(0).catch(() => {});
    p.play();
  } catch { /* sound is never allowed to break the app */ }
}

/** The click for a Dial value: one of twenty notes climbing a pentatonic scale. */
export function tick(value: number) {
  const step = Math.min(100, Math.max(5, Math.round(value / 5) * 5));
  play(`tick_${String(step).padStart(3, '0')}` as SoundName, 0.9);
}
