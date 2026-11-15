// Drag to set a height, shown in feet and inches and in centimetres.
// One handle for your own height, or two for a range on a type.
import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { formatHeight } from '../core/looks';
import { DIAL_GRADIENT, colours, themed } from '../theme';

export const MIN_CM = 140, MAX_CM = 215;
const THUMB = 26;

type Props =
  | { value: number; onChange: (cm: number) => void; range?: false }
  | { low: number; high: number; onChange: (low: number, high: number) => void; range: true };

export function HeightSlider(props: Props) {
  const track = useRef<React.ComponentRef<typeof View>>(null);
  const [geo, setGeo] = useState({ x: 0, w: 1 });
  const active = useRef<'one' | 'low' | 'high'>('one');
  const latest = useRef(props); latest.current = props;
  const geoRef = useRef(geo); geoRef.current = geo;

  const toCm = (pageX: number) => {
    const { x, w } = geoRef.current;
    const t = Math.min(1, Math.max(0, (pageX - x - THUMB / 2) / Math.max(1, w - THUMB)));
    return Math.round(MIN_CM + t * (MAX_CM - MIN_CM));
  };
  const apply = (pageX: number) => {
    const p = latest.current, cm = toCm(pageX);
    if (!p.range) p.onChange(cm);
    else if (active.current === 'low') p.onChange(Math.min(cm, p.high), p.high);
    else p.onChange(p.low, Math.max(cm, p.low));
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      track.current?.measureInWindow((x: number, _y: number, w: number) => { geoRef.current = { x, w }; setGeo({ x, w }); });
      const p = latest.current;
      if (p.range) {
        const cm = toCm(e.nativeEvent.pageX);
        active.current = Math.abs(cm - p.low) <= Math.abs(cm - p.high) ? 'low' : 'high';
      }
      apply(e.nativeEvent.pageX);
    },
    onPanResponderMove: (e) => apply(e.nativeEvent.pageX),
  }), []);

  const pos = (cm: number) => ((cm - MIN_CM) / (MAX_CM - MIN_CM)) * (geo.w - THUMB);
  const a = props.range ? props.low : MIN_CM, b = props.range ? props.high : props.value;
  const label = props.range ? `${formatHeight(props.low)}  to  ${formatHeight(props.high)}` : formatHeight(props.value);

  return (
    <View>
      <Text style={styles.value}>{label}</Text>
      <View ref={track} {...pan.panHandlers} style={[styles.hit, Platform.OS === 'web' && ({ touchAction: 'none', userSelect: 'none', cursor: 'pointer' } as any)]}
        onLayout={() => track.current?.measureInWindow((x: number, _y: number, w: number) => setGeo({ x, w }))}
        accessibilityRole="adjustable" accessibilityLabel={props.range ? 'Height range' : 'Height'} accessibilityValue={{ text: label }}>
        <View style={styles.rail} />
        <View style={[styles.fillWrap, { left: pos(a) + THUMB / 2, width: Math.max(0, pos(b) - pos(a)) }]}>
          <LinearGradient colors={DIAL_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
        </View>
        {props.range && <View style={[styles.thumb, { left: pos(props.low) }]} />}
        <View style={[styles.thumb, { left: pos(b) }]} />
      </View>
      <View style={styles.ends}><Text style={styles.end}>{formatHeight(MIN_CM)}</Text><Text style={styles.end}>{formatHeight(MAX_CM)}</Text></View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  value: { color: colours.text, fontSize: 16, fontWeight: '700', marginBottom: 6, fontVariant: ['lining-nums', 'tabular-nums'] },
  hit: { height: 40, justifyContent: 'center' },
  rail: { position: 'absolute', left: THUMB / 2, right: THUMB / 2, height: 4, borderRadius: 2, backgroundColor: colours.line },
  fillWrap: { position: 'absolute', height: 4, borderRadius: 2, overflow: 'hidden' },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#FFFFFF',
           shadowColor: DIAL_GRADIENT[1], shadowOpacity: 0.8, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: colours.slate, fontSize: 11 },
}));
