import Storage from 'expo-sqlite/kv-store';

// --- Model (v3) ---
// Partlar artık adlandırılmış ÖNAYARLAR (preset) altında yaşar ve her partın
// bir TÜRÜ vardır: 'work' sayılan çalışma süresi, 'break' sayılmayan mola.
// Raporlar ve hedefler yalnızca 'work' partlardan beslenir.

export type PartType = 'work' | 'break';

export type Part = {
  id: string;
  label: string;
  /** Part süresi (dakika). Ondalık olabilir (ör. 0.5 = 30 sn, test için). */
  minutes: number;
  /**
   * Part bitince alarm penceresi (saniye): 0. saniyede 5 sn titreşim, pencere
   * boyunca 15 sn'de bir titreşimsiz bildirim. Sürekli titreşim yok.
   */
  alarmSeconds: number;
  type: PartType;
};

export type TimerPreset = {
  id: string;
  name: string;
  parts: Part[];
};

export type TimerDisplaySize = 'kucuk' | 'orta' | 'buyuk';

export type TimerDisplay = {
  size: TimerDisplaySize;
  color: string;
};

export type TimerSettings = {
  version: 3;
  /** Genel varsayılan önayar; projeler kendi önayarını atayabilir. */
  activePresetId: string;
  autoAdvance: boolean;
  display: TimerDisplay;
};

export const ALARM_REPEAT_EVERY_MS = 15_000;
export const MAX_SCHEDULED_PER_BOUNDARY = 20;

export const PART_LIMITS = {
  minutes: { min: 0.1, max: 999 },
  alarmSeconds: { min: 5, max: 600 },
} as const;

export const PART_TYPE_LABELS: Record<PartType, string> = {
  work: 'Çalışma',
  break: 'Mola',
};

export const TIMER_COLORS = [
  '#E8EAED',
  '#FBBF24',
  '#34D399',
  '#38BDF8',
  '#F472B6',
  '#A78BFA',
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

export const DEFAULT_PRESET: TimerPreset = {
  id: 'default',
  name: 'Varsayılan',
  parts: [
    { id: 'default-hazirlik', label: 'Hazırlık', minutes: 15, alarmSeconds: 60, type: 'work' },
    { id: 'default-odak', label: 'Odak', minutes: 25, alarmSeconds: 60, type: 'work' },
    { id: 'default-mola', label: 'Mola', minutes: 5, alarmSeconds: 30, type: 'break' },
  ],
};

export const DEFAULT_SETTINGS: TimerSettings = {
  version: 3,
  activePresetId: DEFAULT_PRESET.id,
  autoAdvance: true,
  display: DEFAULT_DISPLAY,
};

export const partDurationMs = (part: Part) => Math.round(part.minutes * 60_000);
export const partAlarmMs = (part: Part) => part.alarmSeconds * 1_000;
export const presetTotalMinutes = (preset: TimerPreset) =>
  Math.round(preset.parts.reduce((sum, p) => sum + p.minutes, 0));

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
    type: raw.type === 'break' ? 'break' : 'work',
  };
}

export function sanitizePreset(raw: Partial<TimerPreset>): TimerPreset {
  const parts = Array.isArray(raw.parts) ? raw.parts.map(sanitizePart) : [];
  return {
    id: raw.id || newPartId(),
    name: (raw.name ?? '').trim() || 'Önayar',
    parts: parts.length > 0 ? parts : DEFAULT_PRESET.parts,
  };
}

export function sanitizePresets(raw: unknown): TimerPreset[] {
  const presets = Array.isArray(raw) ? raw.map(sanitizePreset) : [];
  return presets.length > 0 ? presets : [DEFAULT_PRESET];
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

export function sanitizeSettings(raw: unknown, presets: TimerPreset[]): TimerSettings {
  const obj = (raw ?? {}) as Partial<TimerSettings> & { parts?: unknown };
  const activeExists = presets.some((p) => p.id === obj.activePresetId);
  return {
    version: 3,
    activePresetId: activeExists ? (obj.activePresetId as string) : presets[0].id,
    autoAdvance: typeof obj.autoAdvance === 'boolean' ? obj.autoAdvance : true,
    display: sanitizeDisplay(obj.display),
  };
}

// --- Kalıcı depolama ---

const SETTINGS_KEY = 'timer-settings';
const PRESETS_KEY = 'presets-v1';

export type LoadedTimerConfig = { settings: TimerSettings; presets: TimerPreset[] };

/** v2 (tek part listesi) → v3 (önayarlar) migrasyonu dahil yükleme. */
export async function loadTimerConfig(): Promise<LoadedTimerConfig> {
  try {
    const [rawSettings, rawPresets] = await Promise.all([
      Storage.getItem(SETTINGS_KEY),
      Storage.getItem(PRESETS_KEY),
    ]);
    const parsedSettings = rawSettings ? (JSON.parse(rawSettings) as Record<string, unknown>) : null;

    let presets: TimerPreset[];
    if (rawPresets) {
      presets = sanitizePresets(JSON.parse(rawPresets));
    } else if (parsedSettings && Array.isArray(parsedSettings.parts)) {
      // v2 → v3: eski part listesi 'Varsayılan' önayarına sarılır (tümü 'work').
      presets = [
        sanitizePreset({ id: 'default', name: 'Varsayılan', parts: parsedSettings.parts as Part[] }),
      ];
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
}

export async function savePresets(presets: TimerPreset[]): Promise<void> {
  await Storage.setItem(PRESETS_KEY, JSON.stringify(presets));
}
