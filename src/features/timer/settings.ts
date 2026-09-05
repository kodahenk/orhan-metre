import Storage from 'expo-sqlite/kv-store';

import { dateKey } from './format';

// --- Model (v4) ---
// Zamanlayıcı artık serbest part listesi değil, sabit üç fazlı TURLARDAN oluşur:
//
//   Odak → Tekrar → Nefes Al → (sonraki tur) → ...
//
// Döngü kullanıcı "Bitir" diyene kadar sürer. Bir turun sayılması TEKRAR
// fazına ulaşmasına bağlıdır: odak fazında bırakılan tur kayda geçmez.
// Önayar yalnızca dört süreyi taşır; hepsi kullanıcı tarafından ayarlanır.

export type TimerPhase = 'focus' | 'review' | 'breathe';

export const PHASE_LABELS: Record<TimerPhase, string> = {
  focus: 'Odak',
  review: 'Tekrar',
  breathe: 'Nefes Al',
};

/** Turdaki faz sırası; motor ve bildirim zamanlaması bu sırayı izler. */
export const PHASE_ORDER: TimerPhase[] = ['focus', 'review', 'breathe'];

export type TimerPreset = {
  id: string;
  name: string;
  /** Odak süresi (dk). Bu fazda bırakılan tur SAYILMAZ. */
  focusMinutes: number;
  /** Tekrar süresi (dk). Bu faza ulaşan tur çalışılmış sayılır. */
  reviewMinutes: number;
  /** Nefes Al süresi (dk) — tur arası bekleme penceresi. */
  breatheMinutes: number;
  /** Nefes Al boyunca bildirim aralığı (sn). */
  notifySeconds: number;
};

export type TimerDisplaySize = 'kucuk' | 'orta' | 'buyuk';

// Renk kullanıcı ayarı değildir: rakamlar odakta gri, tekrarda mavi, nefes
// alırken sarıdır (tema token'ları); yalnızca boyut tercihi saklanır.
export type TimerDisplay = {
  size: TimerDisplaySize;
};

export type TimerSettings = {
  version: 4;
  /** Genel varsayılan önayar; projeler kendi önayarını atayabilir. */
  activePresetId: string;
  /** true: Nefes Al süresi dolunca sonraki tur kendiliğinden başlar. */
  autoAdvance: boolean;
  /**
   * Odak/Tekrar fazı bitmeden bu kadar dakika önce "bitmeye az kaldı"
   * bildirimi (0 = kapalı). Oturum başında dondurulur.
   */
  workEndReminderMinutes: number;
  /**
   * Planlı başlangıç saati ("09:00" biçimi; null = kapalı). Günün İLK seansı
   * bu saatten geç başlarsa gecikme, borç olarak sonraki Nefes Al
   * sürelerinden düşülür (her nefes en fazla minBreatheMinutes tabanına iner,
   * artan borç sonraki nefese taşar).
   */
  plannedStartTime: string | null;
  /** Nefes Al süresinin borçla inebileceği taban (dk). 0'a izin yok. */
  minBreatheMinutes: number;
  display: TimerDisplay;
};

/** Ayarlar ekranındaki seçenekler; sanitize de bu listeye göre doğrular. */
export const WORK_END_REMINDER_OPTIONS = [0, 1, 3, 5] as const;

export const MIN_BREATHE_LIMITS = { min: 1, max: 30 } as const;

const PLANNED_START_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "09:00" → verilen günün o saatinin zaman damgası (yerel saat dilimi). */
export function plannedStartTimestamp(hhmm: string, now = new Date()): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/**
 * Günün ilk başlatması damgası (yerel YYYY-AA-GG). Gecikme borcu yalnızca
 * damgasız günde hesaplanır; damga borç doğsun doğmasın basılır (erken
 * başlangıç dahil) — aynı gün sonraki seanslar "geç" sayılmaz.
 */
const PLANNED_START_STAMP_KEY = 'planned-start-last-day';

// Damga okuma/yazma, motorun start() akışında SENKRON olmak zorunda (guard
// senkron kalmalı, çift-tık yarışı açılmamalı). Senkron kv API'si web'de
// SharedArrayBuffer'a dayanır ve COOP/COEP başlıkları yoksa kullanılamaz;
// o durumda bellek önbelleğine + async yazmaya düşülür. Önbellek açılışta
// async okumayla doldurulur, böylece web'de de 'günün ilk seansı' doğru
// belirlenir (aksi halde her başlatma geç sayılıp borç üretirdi).
let stampCache: string | null = null;
let stampCacheReady = false;

void Storage.getItem(PLANNED_START_STAMP_KEY)
  .then((v) => {
    if (!stampCacheReady) stampCache = v;
    stampCacheReady = true;
  })
  .catch(() => {});

export function readPlannedStartStamp(): string | null {
  try {
    return Storage.getItemSync(PLANNED_START_STAMP_KEY);
  } catch {
    return stampCache;
  }
}

export function writePlannedStartStamp(day: string): void {
  stampCache = day;
  stampCacheReady = true;
  try {
    Storage.setItemSync(PLANNED_START_STAMP_KEY, day);
  } catch {
    void Storage.setItem(PLANNED_START_STAMP_KEY, day).catch(() => {});
  }
}

/** İleriye dönük zamanlanacak azami bildirim (Android alarm bütçesi). */
export const MAX_SCHEDULED_NOTIFICATIONS = 40;

export const PRESET_LIMITS = {
  focusMinutes: { min: 0.1, max: 300 },
  reviewMinutes: { min: 0.1, max: 300 },
  breatheMinutes: { min: 0.1, max: 120 },
  notifySeconds: { min: 5, max: 600 },
} as const;

export const DISPLAY_SIZE_SCALE: Record<TimerDisplaySize, number> = {
  kucuk: 0.45,
  orta: 0.6,
  buyuk: 0.75,
};

export const DISPLAY_SIZE_LABELS: Record<TimerDisplaySize, string> = {
  kucuk: 'Küçük',
  orta: 'Orta',
  buyuk: 'Büyük',
};

export function newPresetId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_DISPLAY: TimerDisplay = { size: 'buyuk' };

export const DEFAULT_PRESET: TimerPreset = {
  id: 'default',
  name: 'Varsayılan',
  focusMinutes: 25,
  reviewMinutes: 5,
  breatheMinutes: 5,
  notifySeconds: 15,
};

export const DEFAULT_SETTINGS: TimerSettings = {
  version: 4,
  activePresetId: DEFAULT_PRESET.id,
  autoAdvance: true,
  workEndReminderMinutes: 0,
  plannedStartTime: null,
  minBreatheMinutes: 1,
  display: DEFAULT_DISPLAY,
};

/** Fazın önayardaki ham süresi (ms). Nefes Al borçla kısalabilir; borç
 *  motorda uygulanır, burada planlanan süre döner. */
export function phaseDurationMs(preset: TimerPreset, phase: TimerPhase): number {
  const minutes =
    phase === 'focus'
      ? preset.focusMinutes
      : phase === 'review'
        ? preset.reviewMinutes
        : preset.breatheMinutes;
  return Math.round(minutes * 60_000);
}

/** Nefes Al boyunca bildirim aralığı (ms). */
export const notifyIntervalMs = (preset: TimerPreset) => preset.notifySeconds * 1_000;

/** Bir turun toplam süresi (dk) — önayar listelerinde özet için. */
export const roundMinutes = (preset: TimerPreset) =>
  Math.round(preset.focusMinutes + preset.reviewMinutes + preset.breatheMinutes);

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const num = (raw: unknown, fallback: number, limits: { min: number; max: number }) =>
  clamp(Number.isFinite(raw) ? (raw as number) : fallback, limits.min, limits.max);

type LegacyPart = { minutes?: number; alarmSeconds?: number; type?: string };

/**
 * v3 (part listesi) → v4 (tur fazları) dönüşümü: ilk çalışma partı Odak,
 * ikinci çalışma partı Tekrar, ilk mola Nefes Al olur. Eksik olanlar
 * varsayılana düşer.
 */
function fromLegacyParts(parts: LegacyPart[]): Partial<TimerPreset> {
  const works = parts.filter((p) => p.type !== 'break');
  const breaks = parts.filter((p) => p.type === 'break');
  return {
    focusMinutes: works[0]?.minutes,
    reviewMinutes: works[1]?.minutes,
    breatheMinutes: breaks[0]?.minutes,
    notifySeconds: breaks[0]?.alarmSeconds ?? works[0]?.alarmSeconds,
  };
}

export function sanitizePreset(raw: Partial<TimerPreset> & { parts?: unknown }): TimerPreset {
  const legacy = Array.isArray(raw.parts) ? fromLegacyParts(raw.parts as LegacyPart[]) : null;
  const src = { ...(legacy ?? {}), ...raw };
  return {
    id: raw.id || newPresetId(),
    name: (raw.name ?? '').trim() || 'Önayar',
    focusMinutes: num(src.focusMinutes, DEFAULT_PRESET.focusMinutes, PRESET_LIMITS.focusMinutes),
    reviewMinutes: num(
      src.reviewMinutes,
      DEFAULT_PRESET.reviewMinutes,
      PRESET_LIMITS.reviewMinutes,
    ),
    breatheMinutes: num(
      src.breatheMinutes,
      DEFAULT_PRESET.breatheMinutes,
      PRESET_LIMITS.breatheMinutes,
    ),
    notifySeconds: Math.round(
      num(src.notifySeconds, DEFAULT_PRESET.notifySeconds, PRESET_LIMITS.notifySeconds),
    ),
  };
}

export function sanitizePresets(raw: unknown): TimerPreset[] {
  const presets = Array.isArray(raw) ? raw.map(sanitizePreset) : [];
  return presets.length > 0 ? presets : [DEFAULT_PRESET];
}

// Beyaz-liste kurduğu için eski kayıtlardaki fazladan alanlar okunmaz ve ilk
// kaydetmede diskten de temizlenir; ayrı migrasyon gerekmez.
function sanitizeDisplay(raw: unknown): TimerDisplay {
  const obj = (raw ?? {}) as Partial<TimerDisplay>;
  // Object.keys ile kontrol: 'in' operatörü prototip zincirini de kabul
  // ederdi (ör. bozuk depodaki "toString" elemeden geçerdi).
  return {
    size:
      obj.size && Object.keys(DISPLAY_SIZE_SCALE).includes(obj.size)
        ? obj.size
        : DEFAULT_DISPLAY.size,
  };
}

export function sanitizeSettings(raw: unknown, presets: TimerPreset[]): TimerSettings {
  const obj = (raw ?? {}) as Partial<TimerSettings> & { minBreakMinutes?: number };
  const activeExists = presets.some((p) => p.id === obj.activePresetId);
  return {
    version: 4,
    activePresetId: activeExists ? (obj.activePresetId as string) : presets[0].id,
    autoAdvance: typeof obj.autoAdvance === 'boolean' ? obj.autoAdvance : true,
    workEndReminderMinutes: (WORK_END_REMINDER_OPTIONS as readonly number[]).includes(
      obj.workEndReminderMinutes as number,
    )
      ? (obj.workEndReminderMinutes as number)
      : 0,
    plannedStartTime:
      typeof obj.plannedStartTime === 'string' && PLANNED_START_RE.test(obj.plannedStartTime)
        ? obj.plannedStartTime
        : null,
    // v3'te bu ayarın adı minBreakMinutes'tı; eski değer korunur.
    minBreatheMinutes: Math.round(
      num(
        obj.minBreatheMinutes ?? obj.minBreakMinutes,
        DEFAULT_SETTINGS.minBreatheMinutes,
        MIN_BREATHE_LIMITS,
      ),
    ),
    display: sanitizeDisplay(obj.display),
  };
}

// --- Kalıcı depolama ---

const SETTINGS_KEY = 'timer-settings';
const PRESETS_KEY = 'presets-v1';

export type LoadedTimerConfig = { settings: TimerSettings; presets: TimerPreset[] };

/** Eski part tabanlı önayarlar okuma anında tur fazlarına dönüştürülür. */
export async function loadTimerConfig(): Promise<LoadedTimerConfig> {
  try {
    const [rawSettings, rawPresets] = await Promise.all([
      Storage.getItem(SETTINGS_KEY),
      Storage.getItem(PRESETS_KEY),
    ]);
    const parsedSettings = rawSettings
      ? (JSON.parse(rawSettings) as Record<string, unknown>)
      : null;

    let presets: TimerPreset[];
    if (rawPresets) {
      presets = sanitizePresets(JSON.parse(rawPresets));
    } else if (parsedSettings && Array.isArray(parsedSettings.parts)) {
      // Çok eski (v2) tek part listesi de aynı dönüşümden geçer.
      presets = [sanitizePreset({ id: 'default', name: 'Varsayılan', parts: parsedSettings.parts })];
      await Storage.setItem(PRESETS_KEY, JSON.stringify(presets)).catch(() => {});
    } else {
      presets = [DEFAULT_PRESET];
    }

    const settings = sanitizeSettings(parsedSettings, presets);
    return { settings, presets };
  } catch {
    return { settings: DEFAULT_SETTINGS, presets: [DEFAULT_PRESET] };
  }
}

export async function saveSettings(settings: TimerSettings): Promise<void> {
  await Storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  // Gün ortasında etkinleştirme koruması: bugünün planlı saati çoktan
  // geçmişse damga bugüne basılır → gecikme borcu yarından itibaren işler;
  // saatler sonra açılan seansa "hayalet borç" yazılmaz.
  if (settings.plannedStartTime && plannedStartTimestamp(settings.plannedStartTime) < Date.now()) {
    writePlannedStartStamp(dateKey(new Date()));
  }
}

export async function savePresets(presets: TimerPreset[]): Promise<void> {
  await Storage.setItem(PRESETS_KEY, JSON.stringify(presets));
}
