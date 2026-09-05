/** Light palet — tüm normal ekranlar. */
export const L = {
  canvas: '#F5F7FB',
  surface: '#FFFFFF',
  hairline: '#E5EAF2',
  border: '#DCE3ED',
  borderActive: '#C9C9C9',
  pressed: '#F2F2F2',
  selected: '#F0F7FF',
  ink: '#17243B',
  ink2: '#526078',
  muted: '#526078', // ink2 ile ayni — rampa disina cikilmaz,
  tertiary: '#68768C',
  accent: '#315FE9',
  accentPressed: '#254CC4',
  accentSoft: '#D3E5FF',
  success: '#18804B',
  danger: '#EE0000',
  dangerSoft: '#F7D4D6',
  warning: '#B45309',
} as const;

/** Dark palet — yalnızca tam ekran AMOLED zamanlayıcı. */
export const D = {
  bg: '#000000',
  text: '#E8EAED',
  text2: '#8A8F98',
  text3: '#5A5F68',
  border: '#2A2D33',
  hairline: '#23252A',
  dotOff: '#1C1E22',
  dotPast: '#4A4F58',
  amber: '#B8860B',
  // Faz renkleri (tam ekran sayaç): Odak gri (text), Tekrar mavi,
  // Nefes Al sarı — ince mono fontta siyah üzerinde okunaklı tonlar.
  yellow: '#FBBF24',
  sky: '#7DD3FC',
  clock: '#B6BBC2',
} as const;

/** Ortak kontrol ve kart köşe yarıçapları. */
export const R = {
  sm: 6, // onay kutuları
  md: 10, // butonlar, girdiler, segmentler, çipler, takvim hücreleri
  lg: 16, // kartlar
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

/** Projelere atanabilir renkler — beyaz üzerinde ≥4.5:1 kontrast. */
export const PROJECT_COLORS = [
  '#0B62D6', // mavi
  '#1A7F37', // yeşil
  '#B45309', // turuncu
  '#CF222E', // kırmızı
  '#6639BA', // mor
  '#0E7490', // camgöbeği
  '#BF3989', // pembe
  '#57606A', // gri
] as const;
