/**
 * Tasarım sistemi (Geist türevi, light-first):
 * - Uygulamanın tamamı LIGHT: kağıt dokulu #FAFAFA zemin, #FFFFFF yüzeyler,
 *   gölge YOK — ayrım her zaman 1px hairline kenarlıkla.
 * - Tek vurgu rengi (#0070F3) tüm etkileşimi taşır; proje renkleri arayüzle yarışmaz.
 * - Köşe yarıçapları minimal: 3 / 4 / 6dp. Hap (pill) yok.
 * - YALNIZCA tam ekran zamanlayıcı AMOLED siyah kalır (D paleti).
 * - İki font ailesi: arayüz Inter, zamanlayıcı rakamları Roboto Mono.
 */

/** Light palet — tüm normal ekranlar. */
export const L = {
  canvas: '#FAFAFA',
  surface: '#FFFFFF',
  hairline: '#EBEBEB',
  border: '#E6E6E6',
  borderActive: '#C9C9C9',
  pressed: '#F2F2F2',
  selected: '#F0F7FF',
  ink: '#171717',
  ink2: '#4D4D4D',
  muted: '#4D4D4D', // ink2 ile ayni — rampa disina cikilmaz,
  tertiary: '#8F8F8F',
  accent: '#0070F3',
  accentPressed: '#0761D1',
  accentSoft: '#D3E5FF',
  success: '#28A948',
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

/** Köşe yarıçapı token'ları — başka değer kullanılmaz. */
export const R = {
  sm: 3, // onay kutuları
  md: 4, // butonlar, girdiler, segmentler, çipler, takvim hücreleri
  lg: 6, // kartlar
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
