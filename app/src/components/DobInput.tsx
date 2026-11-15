// Date of birth box: type digits only; the slashes sit in place and the rest of DD/MM/YYYY shows faintly.
import React from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type TextStyle } from 'react-native';
import { dobMaskRest, formatDob } from '../core/dob';
import { colours } from '../theme';

export function DobInput({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: TextStyle }) {
  const flat = StyleSheet.flatten(style) ?? {};
  // The mask is drawn underneath with the same font and padding, so typed digits line up over it.
  const align: TextStyle = {
    fontSize: flat.fontSize, paddingHorizontal: flat.paddingHorizontal, paddingLeft: flat.paddingLeft,
    paddingVertical: flat.paddingVertical, paddingTop: flat.paddingTop, fontFamily: flat.fontFamily,
  };
  return (
    <View>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(formatDob(t))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={10}
        autoComplete="birthdate-full"
        textContentType="none"
        style={[style, styles.digits]}
        accessibilityLabel="Date of birth, day month year"
        accessibilityHint="Type the digits; the slashes are added for you"
      />
      <Text style={[styles.mask, align]} pointerEvents="none" numberOfLines={1} importantForAccessibility="no" accessibilityElementsHidden>
        <Text style={{ color: 'transparent' }}>{value}</Text>
        <Text style={{ color: colours.slate }}>{dobMaskRest(value)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  digits: { fontVariant: ['tabular-nums'], backgroundColor: 'transparent', zIndex: 1 },
  mask: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, borderWidth: 1, borderColor: 'transparent', fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'web' ? ({ lineHeight: 'normal', display: 'flex', alignItems: 'center' } as any) : { textAlignVertical: 'center' }) },
});
