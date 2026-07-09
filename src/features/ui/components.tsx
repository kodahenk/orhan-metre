import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C, F } from './theme';

/** Sekme ekranlarının ortak üst barı. */
export function ScreenHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

type PillButtonProps = {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  primary?: boolean;
  /** Zamanlayıcı ekranlarında mono, uygulama ekranlarında Inter. */
  font?: string;
};

export function PillButton({ icon, label, onPress, primary, font = F.mono }: PillButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pill,
        primary && styles.pillPrimary,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Feather name={icon} size={18} color={primary ? C.text : C.text2} />
      <Text
        style={[styles.pillText, { fontFamily: font }, primary && styles.pillTextPrimary]}
        maxFontSizeMultiplier={1.3}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Sağ üst köşe eylemleri için 44dp'lik ikon butonu. */
export function HeaderIconButton({
  icon,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [styles.headerIcon, pressed && styles.pressed]}
    >
      <Feather name={icon} size={20} color={C.text2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.surface2,
  },
  headerTitle: {
    color: C.text,
    fontFamily: F.uiSemi,
    fontSize: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 13,
  },
  pillPrimary: {
    borderColor: C.text,
    paddingHorizontal: 34,
  },
  pillText: {
    color: C.text2,
    fontSize: 14,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pillTextPrimary: {
    color: C.text,
  },
  pressed: {
    opacity: 0.6,
  },
});
