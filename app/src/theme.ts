// Dial's visual identity: dark, sleek and quietly expensive. Champagne for actions, hairline glass
// surfaces, small spaced capitals. Colour glow lives only in the Dial and the ambient background.
export type ThemeName = 'paper' | 'ink';

const palettes = {
  // Default: dark, with an ambient glow drifting behind glass surfaces.
  ink: {
    bg: '#08070F', surface: 'rgba(255,255,255,0.045)', surfaceRaised: 'rgba(255,255,255,0.075)', surfaceSolid: '#15121F',
    line: 'rgba(255,255,255,0.10)', text: '#F6F2EA', slate: '#9C97AC',
    accent: '#EADBC2', accentTint: 'rgba(234,219,194,0.10)', onAccent: '#0A0913',
    foil: '#D9B26A', good: '#5EE0A8', danger: '#FF8A7A', onMedia: '#FFFFFF', tabBar: 'rgba(10,9,19,0.82)', glow: 0.75,
  },
  // Optional light look.
  paper: {
    bg: '#F5F0E6', surface: '#FFFDF8', surfaceRaised: '#EDE6D8', surfaceSolid: '#FFFDF8',
    line: '#DCD2C1', text: '#12142A', slate: '#6A6777',
    accent: '#12142A', accentTint: 'rgba(18,20,42,0.06)', onAccent: '#F5F0E6',
    foil: '#B8913F', good: '#1E7D52', danger: '#B4321F', onMedia: '#FFFFFF', tabBar: '#FFFDF8', glow: 0.22,
  },
} as const;

export type Palette = { [K in keyof typeof palettes.ink]: K extends 'glow' ? number : string };

let current: ThemeName = 'ink';
const listeners = new Set<(t: ThemeName) => void>();

export const themeName = () => current;
export function setTheme(t: ThemeName) {
  if (t === current) return;
  current = t;
  listeners.forEach((l) => l(t));
}
export function onThemeChange(l: (t: ThemeName) => void) { listeners.add(l); return () => { listeners.delete(l); }; }

/** Always reads the active theme, so inline styles pick up a theme change on the next render. */
export const colours: Palette = new Proxy({} as Palette, { get: (_t, k) => (palettes[current] as any)[k] });

/** Wraps a style sheet so it is built once per theme and read from the active one. */
export function themed<T extends object>(make: () => T): T {
  const cache: Partial<Record<ThemeName, T>> = {};
  return new Proxy({} as T, { get: (_t, k) => ((cache[current] ??= make()) as any)[k] });
}

// A fashion-led italic serif for names, titles and numbers; the system sans (SF Pro on iPhone) for everything else.
export const serif = 'CormorantGaramond_500Medium_Italic';
/** The Dial's signature gradient: the Dial, primary buttons and the ambient glow. */
export const DIAL_GRADIENT = ['#FF6B5E', '#C2409B', '#5B3FD6'] as const;

export const radius = { card: 26, control: 999, pill: 999 };
