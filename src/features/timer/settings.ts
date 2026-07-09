import Storage from 'expo-sqlite/kv-store';

// --- Model ---

export type Part = {
  id: string;
  label: string;
  /** Part süresi (dakika). Ondalık olabilir (ör. 0.5 = 30 sn, test için). */
  minutes: number;
  /** Part bitince alarmın (15 sn'de bir bildirim + titreşim) süreceği süre (saniye). */
  alarmSeconds: number;
};

export type TimerDisplaySize = 'kucuk' | 'orta' | 'buyuk';

export type TimerDisplay = {
  /** Sayaç rakamlarının ekran ölçüsüne göre ölçeği. */
  size: TimerDisplaySize;
  /** Sayaç rakam rengi (hex). */
  color: string;
};

export type TimerSettings = {
  version: 2;
  parts: Part[];
  /**
   * true → alarm süresi dolunca sonraki part kendiliğinden başlar;
   * false → "Devam"a basılana kadar beklenir.
   */
  autoAdvance: boolean;
  display: TimerDisplay;
};

export const ALARM_REPEAT_EVERY_MS = 15_000;

// Sınır başına zamanlanacak bildirim üst sınırı: çok uzun alarm sürelerinde
// sistemi bildirime boğmamak için (uygulama içi titreşim pencerenin tamamını kapsar).
export const MAX_SCHEDULED_PER_BOUNDARY = 20;

export const PART_LIMITS = {
  minutes: { min: 0.1, max: 999 },
  alarmSeconds: { min: 5, max: 600 },
} as const;

/** Sayaç için seçilebilir renkler (AMOLED siyah üzerinde yüksek kontrast). */
export const TIMER_COLORS = [
  '#E8EAED', // beyaz
  '#FBBF24', // kehribar
  '#34D399', // yeşil
  '#38BDF8', // mavi
  '#F472B6', // pembe
  '#A78BFA', // mor
] as const;

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

export function newPartId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const DEFAULT_DISPLAY: TimerDisplay = { size: 'buyuk', color: TIMER_COLORS[0] };

export const DEFAULT_SETTINGS: TimerSettings = {
  version: 2,
  parts: [
    { id: 'default-hazirlik', label: 'Hazırlık', minutes: 15, alarmSeconds: 60 },
    { id: 'default-odak', label: 'Odak', minutes: 25, alarmSeconds: 60 },
  ],
  autoAdvance: true,
  display: DEFAULT_DISPLAY,
};

export const partDurationMs = (part: Part) => Math.round(part.minutes * 60_000);
export const partAlarmMs = (part: Part) => part.alarmSeconds * 1_000;
export const totalMinutes = (parts: Part[]) =>
  Math.round(parts.reduce((sum, p) => sum + p.minutes, 0));

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function sanitizePart(raw: Partial<Part>): Part {
  return {
    id: raw.id || newPartId(),
    label: (raw.label ?? '').trim() || 'Part',
    minutes: clamp(
      Number.isFinite(raw.minutes) ? (raw.minutes as number) : 25,
      PART_LIMITS.minutes.min,
      PART_LIMITS.minutes.max,
    ),
    alarmSeconds: Math.round(
      clamp(
        Number.isFinite(raw.alarmSeconds) ? (raw.alarmSeconds as number) : 60,
        PART_LIMITS.alarmSeconds.min,
        PART_LIMITS.alarmSeconds.max,
      ),
    ),
  };
}

function sanitizeDisplay(raw: unknown): TimerDisplay {
  const obj = (raw ?? {}) as Partial<TimerDisplay>;
  return {
    size: obj.size && obj.size in DISPLAY_SIZE_SCALE ? obj.size : DEFAULT_DISPLAY.size,
    color:
      typeof obj.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(obj.color)
        ? obj.color
        : DEFAULT_DISPLAY.color,
  };
}

/** Eski sürüm kayıtlar dahil her girdiyi geçerli bir v2 ayarına dönüştürür. */
export function sanitizeSettings(raw: unknown): TimerSettings {
  const obj = (raw ?? {}) as Partial<TimerSettings>;
  const parts = Array.isArray(obj.parts) ? obj.parts.map(sanitizePart) : [];
  return {
    version: 2,
    parts: parts.length > 0 ? parts : DEFAULT_SETTINGS.parts,
    autoAdvance: typeof obj.autoAdvance === 'boolean' ? obj.autoAdvance : true,
    display: sanitizeDisplay(obj.display),
  };
}

// --- Kalıcı depolama (expo-sqlite/kv-store) ---

const STORAGE_KEY = 'timer-settings';

export async function loadSettings(): Promise<TimerSettings> {
  try {
    const raw = await Storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: TimerSettings): Promise<void> {
  await Storage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
