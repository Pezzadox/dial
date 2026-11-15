// The ambient glow: three soft pools of the Dial's colours drifting slowly behind every screen.
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { DIAL_GRADIENT, colours } from '../theme';

const BLOBS = [
  { colour: DIAL_GRADIENT[2], x: -0.35, y: -0.15, size: 1.3, dx: 0.12, dy: 0.08, ms: 17000 },
  { colour: DIAL_GRADIENT[1], x: 0.35, y: 0.3, size: 1.1, dx: -0.14, dy: 0.1, ms: 21000 },
  { colour: DIAL_GRADIENT[0], x: -0.2, y: 0.75, size: 1.0, dx: 0.1, dy: -0.12, ms: 25000 },
];

export function Ambient() {
  const { width, height } = useWindowDimensions();
  const t = useRef(BLOBS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = t.map((v, i) => Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: BLOBS[i].ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(v, { toValue: 0, duration: BLOBS[i].ms, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web' }),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [t]);
  const base = Math.max(width, 480);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colours.bg, overflow: 'hidden' }]} pointerEvents="none">
      {BLOBS.map((b, i) => {
        const size = base * b.size;
        return (
          <Animated.View key={i} style={{
            position: 'absolute', width: size, height: size, opacity: colours.glow,
            left: width / 2 + b.x * width - size / 2, top: b.y * height,
            transform: [
              { translateX: t[i].interpolate({ inputRange: [0, 1], outputRange: [0, b.dx * width] }) },
              { translateY: t[i].interpolate({ inputRange: [0, 1], outputRange: [0, b.dy * height] }) },
            ],
          }}>
            <Svg width={size} height={size}>
              <Defs>
                <RadialGradient id={`amb${i}`} cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={b.colour} stopOpacity={0.55} />
                  <Stop offset="0.45" stopColor={b.colour} stopOpacity={0.18} />
                  <Stop offset="1" stopColor={b.colour} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#amb${i})`} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}
