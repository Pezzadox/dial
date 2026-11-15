// A photo or video shown as a circle, with a thin arc showing your Dial for it.
// Hold to open it full screen and turn in one motion, or tap to open it and drag.
import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { Media } from '../api';
import { ringPath } from '../core/gauge';
import { DIAL_GRADIENT, colours, themed } from '../theme';
import { useDialStage } from './DialStage';
import { MediaTile } from './MediaTile';

const HOLD_MS = 160;
let seq = 0;

export function DialCircle({ media, size, score, onRate, onActiveChange }:
  { media: Media; size: number; score: number | null | undefined; onRate: (v: number) => void; onActiveChange?: (on: boolean) => void }) {
  const stage = useDialStage();
  const latest = useRef({ media, score, onRate, onActiveChange }); latest.current = { media, score, onRate, onActiveChange };
  const s = useRef({ timer: null as ReturnType<typeof setTimeout> | null, held: false });
  const gid = useMemo(() => `dc${++seq}`, []);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => !s.current.held,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      s.current.held = false;
      s.current.timer = setTimeout(() => {
        s.current.held = true; latest.current.onActiveChange?.(true);
        stage.begin({ media: latest.current.media, start: latest.current.score ?? 1, onSet: latest.current.onRate }, 'held');
      }, HOLD_MS);
    },
    onPanResponderMove: (e) => { if (s.current.held) stage.move(e.nativeEvent.pageX, e.nativeEvent.pageY); },
    onPanResponderRelease: () => {
      if (s.current.timer) clearTimeout(s.current.timer);
      if (s.current.held) { stage.end(); latest.current.onActiveChange?.(false); }
      else stage.begin({ media: latest.current.media, start: latest.current.score ?? 1, onSet: latest.current.onRate }, 'interactive');
      s.current.held = false;
    },
    onPanResponderTerminate: () => {
      if (s.current.timer) clearTimeout(s.current.timer);
      if (s.current.held) { stage.end(); latest.current.onActiveChange?.(false); }
      s.current.held = false;
    },
  }), [stage]);

  const { d, length } = ringPath(size, 3);
  const shown = score ?? 0;
  return (
    <View style={{ alignItems: 'center' }}>
      <View {...pan.panHandlers} style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, Platform.OS === 'web' && ({ cursor: 'pointer', userSelect: 'none', touchAction: 'none' } as any)]}
        accessibilityRole="button" accessibilityLabel={`Dial this ${media.kind}`} accessibilityValue={{ text: score == null ? 'not dialled' : `${score}` }}
        accessibilityHint="Opens it full screen. Turn around the middle to set from 1 to 100.">
        <MediaTile media={media} width={size} height={size} small play />
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={DIAL_GRADIENT[0]} /><Stop offset="0.5" stopColor={DIAL_GRADIENT[1]} /><Stop offset="1" stopColor={DIAL_GRADIENT[2]} />
          </LinearGradient></Defs>
          <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fill="none" />
          {shown > 0 && <Path d={d} stroke={shown >= 100 ? colours.foil : `url(#${gid})`} strokeWidth={4} strokeLinecap="round" fill="none" strokeDasharray={`${(length * shown) / 100} ${length}`} />}
        </Svg>
      </View>
      <Text style={styles.caption} numberOfLines={1}>{score != null ? `Your Dial · ${score}` : media.caption ?? (media.kind === 'video' ? 'Video' : 'Photo')}</Text>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  circle: { overflow: 'hidden', backgroundColor: colours.surfaceRaised },
  caption: { color: colours.slate, fontSize: 11, letterSpacing: 0.4, marginTop: 8, maxWidth: 220, textAlign: 'center' },
}));
