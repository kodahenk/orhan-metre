import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

/**
 * Arka plan mini sayacı (modules/mini-timer yerel modülü):
 * uygulama arkaya atılınca sol üstte yarı saydam overlay sayaç (izin
 * gerektirir) + bildirim panelinde kronometreli kalıcı sayaç (yedek).
 * Expo Go'da / Android dışında modül yoktur; tüm çağrılar sessiz no-op.
 */
type MiniTimerModule = {
  hasOverlayPermission(): boolean;
  requestOverlayPermission(): void;
  showOverlay(endsAt: number, label: string): void;
  hideOverlay(): void;
  showCountdownNotification(endsAt: number, title: string): void;
  hideCountdownNotification(): void;
};

const MiniTimer =
  Platform.OS === 'android' ? requireOptionalNativeModule<MiniTimerModule>('MiniTimer') : null;

export const miniTimerSupported = MiniTimer != null;

export function hasOverlayPermission(): boolean {
  try {
    return MiniTimer?.hasOverlayPermission() ?? false;
  } catch {
    return false;
  }
}

/** "Diğer uygulamaların üzerinde göster" sistem ayarını açar. */
export function requestOverlayPermission() {
  try {
    MiniTimer?.requestOverlayPermission();
  } catch {}
}

/** Arka plana geçişte: izin varsa overlay, her durumda kronometreli bildirim. */
export function showMiniTimer(endsAt: number, label: string) {
  if (!MiniTimer) return;
  try {
    if (MiniTimer.hasOverlayPermission()) MiniTimer.showOverlay(endsAt, label);
    MiniTimer.showCountdownNotification(endsAt, label);
  } catch {}
}

/** Ön plana dönüşte ve sayaç sonlandığında çağrılır. */
export function hideMiniTimer() {
  if (!MiniTimer) return;
  try {
    MiniTimer.hideOverlay();
    MiniTimer.hideCountdownNotification();
  } catch {}
}
