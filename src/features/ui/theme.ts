/**
 * Tasarım belirteçleri. İki font ailesi bilinçli olarak ayrı:
 * - Uygulama arayüzü (sekmeler, projeler, takvim, ayarlar): Inter
 * - Zamanlayıcı gösterimi (rakamlar, saat, tarih): Roboto Mono
 */
export const C = {
  bg: '#000000',
  surface: '#0A0B0D',
  surface2: '#111316',
  border: '#15171B',
  border2: '#2A2D33',
  text: '#E8EAED',
  text2: '#8A8F98',
  text3: '#5A5F68',
  faint: '#3A3E45',
  green: '#34D399',
  red: '#F87171',
  amber: '#B8860B',
  blue: '#38BDF8',
} as const;

export const F = {
  // Uygulama arayüzü
  ui: 'Inter_400Regular',
  uiMed: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  // Zamanlayıcı
  mono: 'RobotoMono_300Light',
  monoThin: 'RobotoMono_200ExtraLight',
  monoMed: 'RobotoMono_500Medium',
} as const;

/** Projelere atanabilir renkler. */
export const PROJECT_COLORS = [
  '#38BDF8',
  '#34D399',
  '#FBBF24',
  '#F472B6',
  '#A78BFA',
  '#F87171',
] as const;
