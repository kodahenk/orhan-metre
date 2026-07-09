import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { F, L, R } from './theme';

/**
 * Sekme ekranlarının ortak üst barı: beyaz yüzey, altta hairline,
 * sola dayalı başlık (16dp hizası), sağda en fazla iki eylem.
 */
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
      hitSlop={8}
      style={({ pressed }) => [styles.headerIcon, pressed && styles.headerIconPressed]}
    >
      <Feather name={icon} size={22} color={L.ink2} />
    </Pressable>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: ButtonVariant;
  disabled?: boolean;
};

const BUTTON_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: L.ink,
  danger: L.danger,
  ghost: L.accent,
};

/** 44dp, radius 4, Inter 600 14 — gölgesiz, hairline ayrımlı. */
export function Button({ label, onPress, icon, variant = 'secondary', disabled }: ButtonProps) {
  const textColor = disabled ? L.tertiary : BUTTON_TEXT_COLOR[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'danger' && styles.buttonDanger,
        pressed && variant === 'primary' && styles.buttonPrimaryPressed,
        pressed && variant === 'secondary' && styles.buttonSecondaryPressed,
        pressed && variant === 'danger' && styles.buttonDangerPressed,
        pressed && variant === 'ghost' && styles.buttonGhostPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      {icon && <Feather name={icon} size={17} color={textColor} />}
      <Text style={[styles.buttonText, { color: textColor }]} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </Pressable>
  );
}

/** 20dp kare onay kutusu (radius 3) — dokunma hedefi 44dp. */
export function Checkbox({ checked, onPress }: { checked: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.checkboxTarget}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Feather name="check" size={14} color="#FFFFFF" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 16,
    paddingRight: 8,
    height: 56,
    backgroundColor: L.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.hairline,
  },
  headerTitle: {
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 18,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  headerIconPressed: {
    backgroundColor: L.pressed,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: R.md,
  },
  buttonPrimary: {
    backgroundColor: L.accent,
  },
  buttonPrimaryPressed: {
    backgroundColor: L.accentPressed,
  },
  buttonSecondary: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
  },
  buttonSecondaryPressed: {
    backgroundColor: L.pressed,
    borderColor: L.borderActive,
  },
  buttonDanger: {
    backgroundColor: L.surface,
    borderWidth: 1,
    borderColor: L.border,
  },
  buttonDangerPressed: {
    backgroundColor: L.dangerSoft,
  },
  buttonGhostPressed: {
    backgroundColor: L.selected,
  },
  buttonDisabled: {
    backgroundColor: L.pressed,
    borderWidth: 0,
  },
  buttonText: {
    fontFamily: F.uiSemi,
    fontSize: 14,
    letterSpacing: 0.1,
  },
  checkboxTarget: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: R.sm,
    borderWidth: 1.5,
    borderColor: L.borderActive,
    backgroundColor: L.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: L.accent,
    borderColor: L.accent,
  },
});
