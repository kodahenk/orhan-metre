import { Feather } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';


import { F, L, R } from './theme';

/**
 * Sekme ekranlarının ortak üst barı: beyaz yüzey, altta hairline,
 * sola dayalı başlık ve açıklama, sağda en fazla iki eylem.
 */
export function ScreenHeader({ title, subtitle, left, right }: { title: string; subtitle?: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text numberOfLines={2} style={styles.headerTitle} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {subtitle && <Text style={{ fontFamily: F.ui, fontSize: 12, color: L.tertiary }}>{subtitle}</Text>}
      </View>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function HeaderIconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label ?? ({ maximize: 'Tam ekran', share: 'Raporu paylaş', 'arrow-left': 'Geri', settings: 'Ayarlar' } as Record<string, string>)[icon] ?? icon}
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

/** En az 48dp dokunma alanı; ortak renk ve köşe tokenları. */
export function Button({ label, onPress, icon, variant = 'secondary', disabled }: ButtonProps) {
  const textColor = disabled ? L.tertiary : BUTTON_TEXT_COLOR[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
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

/** 20dp onay kutusu; dokunma hedefi 44dp. */
export function Checkbox({ checked, onPress, label = 'Tamamlandı' }: { checked: boolean; onPress: () => void; label?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={onPress} hitSlop={6} style={styles.checkboxTarget}>
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
    paddingLeft: 12,
    paddingRight: 8,
    minHeight: 56,
    paddingVertical: 4,
    backgroundColor: L.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: L.hairline,
  },
  headerTitle: {
    color: L.ink,
    fontFamily: F.uiSemi,
    fontSize: 18,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.md,
  },
  headerIconPressed: {
    backgroundColor: L.pressed,
  },
  button: {
    maxWidth: '100%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10,
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
    flexShrink: 1,
    textAlign: 'center',
    fontFamily: F.uiSemi,
    fontSize: 14,
    letterSpacing: 0.1,
  },
  checkboxTarget: {
    flexShrink: 0,
    width: 44,
    height: 44,
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

export { PickerSheet, type PickerOption } from './picker-sheet';

export function ScreenIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <View style={{ gap: 8, paddingVertical: 12 }}>
    <Text style={{ color: L.accent, fontFamily: F.uiSemi, fontSize: 11, letterSpacing: 1.6 }}>{eyebrow}</Text>
    <Text accessibilityRole="header" style={{ color: L.ink, fontFamily: F.uiSemi, fontSize: 28, letterSpacing: -0.9 }}>{title}</Text>
    <Text style={{ color: L.ink2, fontFamily: F.ui, fontSize: 14, lineHeight: 22 }}>{description}</Text>
  </View>;
}

export function EmptyState({ icon, title, description, action }: { icon: keyof typeof Feather.glyphMap; title: string; description: string; action?: ReactNode }) {
  return <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 28 }}>
    <Feather name={icon} size={22} color={L.tertiary} />
    <Text style={{ fontFamily: F.uiMed, color: L.ink, fontSize: 15, textAlign: 'center' }}>{title}</Text>
    <Text style={{ fontFamily: F.ui, color: L.tertiary, fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{description}</Text>
    {action}
  </View>;
}

export function LoadingScreen() {
  return <View style={{ flex: 1, backgroundColor: L.canvas, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
    <ActivityIndicator size="large" color={L.accent} />
    <Text accessibilityLiveRegion="polite" style={{ color: L.ink2, fontSize: 14 }}>Çalışma alanın hazırlanıyor…</Text>
  </View>;
}
