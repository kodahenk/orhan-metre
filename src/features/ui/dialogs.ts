import { Alert, Platform } from 'react-native';

/**
 * Onay diyaloğu.
 *
 * react-native-web'de `Alert.alert` gövdesi boş bir no-op'tur (`class Alert {
 * static alert() {} }`): web'de hiçbir şey görünmez ve onay hiç gelmediği için
 * silme/bitirme akışları sessizce ölür. Bu yüzden web'de tarayıcının kendi
 * `confirm` diyaloğu kullanılır; yerelde alışıldık Alert davranışı korunur.
 */
export function confirmAction(options: {
  title: string;
  message: string;
  /** Onay butonunun metni (varsayılan: Sil). */
  confirmLabel?: string;
  /** false: yıkıcı olmayan eylem (ör. "Sayaca git"). */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}): void {
  const { title, message, confirmLabel = 'Sil', destructive = true, onConfirm } = options;
  if (Platform.OS === 'web') {
    // Web'de onay metni tek gövdede birleşir; onConfirm async olabilir.
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      void Promise.resolve(onConfirm()).catch(() => {});
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Vazgeç', style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: () => void Promise.resolve(onConfirm()).catch(() => {}),
    },
  ]);
}
