import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { Media } from '../api/types';
import Feather from '@expo/vector-icons/Feather';
import { colours, serif, themed } from '../theme';

/** A photo or a video. Without a URL (demo data) it draws a placeholder. Videos play muted on a loop. */
export function MediaTile({ media, width, height, small, play }: { media: Media; width: number; height: number; small?: boolean; play?: boolean }) {
  const [a, b] = media.palette ?? [colours.surfaceRaised, colours.accent];
  const gid = 'mt' + media.id.replace(/[^a-zA-Z0-9]/g, '');
  let content: React.ReactNode;
  if (media.url && media.kind === 'photo') {
    content = <Image source={{ uri: media.url }} style={{ width, height }} resizeMode="cover" accessibilityLabel={media.caption ?? 'Photo'} />;
  } else if (media.url && media.kind === 'video' && (!small || play)) {
    content = <LoopingVideo uri={media.url} width={width} height={height} />;
  } else {
    content = (
      <Svg width={width} height={height}>
        <Defs><LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={a} /><Stop offset="1" stopColor={b} /></LinearGradient></Defs>
        <Rect width={width} height={height} fill={`url(#${gid})`} />
      </Svg>
    );
  }
  return (
    <View style={{ width, height }}>
      {content}
      {!small && (
        <View style={styles.caption} pointerEvents="none">
          <Text style={styles.kind}>{media.kind === 'video' ? <><Feather name="play" size={11} color={colours.onMedia} />{`  ${media.videoRole ?? ''} video`}</> : 'Photo'}</Text>
          {!!media.caption && <Text style={styles.text}>{media.caption}</Text>}
        </View>
      )}
      {small && media.kind === 'video' && <View style={styles.smallVideo} pointerEvents="none"><Feather name="play" size={11} color={colours.onMedia} /></View>}
    </View>
  );
}

function LoopingVideo({ uri, width, height }: { uri: string; width: number; height: number }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={{ width, height }} contentFit="cover" nativeControls={false} pointerEvents="none" />;
}

const styles = themed(() => StyleSheet.create({
  caption: { position: 'absolute', left: 18, top: 16, right: 18 },
  kind: { color: colours.onMedia, opacity: 0.85, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  text: { color: colours.onMedia, fontFamily: serif, fontSize: 22, marginTop: 6 },
  smallVideo: { position: 'absolute', right: 6, bottom: 6 },
}));
