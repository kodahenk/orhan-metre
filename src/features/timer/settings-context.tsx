import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_PRESET,
  DEFAULT_SETTINGS,
  loadTimerConfig,
  newPresetId,
  sanitizePreset,
  sanitizeSettings,
  savePresets,
  saveSettings,
  type TimerPreset,
  type TimerSettings,
} from './settings';

type SettingsContextValue = {
  settings: TimerSettings;
  presets: TimerPreset[];
  loaded: boolean;
  save: (next: TimerSettings) => Promise<void>;
  /** Var olan önayarı günceller (id eşleşmesiyle). */
  savePreset: (preset: TimerPreset) => Promise<void>;
  /** Etkin önayarın kopyasından yeni önayar oluşturur, id'sini döndürür. */
  addPreset: () => string;
  /** Önayarı siler (sonuncusu silinemez); etkinse ilkine düşer. */
  deletePreset: (id: string) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  presets: [DEFAULT_PRESET],
  loaded: false,
  save: async () => {},
  savePreset: async () => {},
  addPreset: () => DEFAULT_PRESET.id,
  deletePreset: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [presets, setPresets] = useState<TimerPreset[]>([DEFAULT_PRESET]);
  const [loaded, setLoaded] = useState(false);

  // Callback'lerin güncel değerleri senkron okuyabilmesi için aynalar.
  const settingsRef = useRef(settings);
  const presetsRef = useRef(presets);
  useEffect(() => {
    settingsRef.current = settings;
    presetsRef.current = presets;
  }, [settings, presets]);

  useEffect(() => {
    let cancelled = false;
    loadTimerConfig().then(({ settings: s, presets: p }) => {
      if (!cancelled) {
        setSettings(s);
        setPresets(p);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: TimerSettings) => {
    const clean = sanitizeSettings(next, presetsRef.current);
    setSettings(clean);
    await saveSettings(clean);
  }, []);

  const savePreset = useCallback(async (preset: TimerPreset) => {
    const clean = sanitizePreset(preset);
    setPresets((prev) => {
      const next = prev.map((p) => (p.id === clean.id ? clean : p));
      void savePresets(next);
      return next;
    });
  }, []);

  const addPreset = useCallback(() => {
    const id = newPresetId();
    const source =
      presetsRef.current.find((p) => p.id === settingsRef.current.activePresetId) ??
      presetsRef.current[0];
    const copy: TimerPreset = { ...source, id, name: `${source.name} kopyası` };
    const next = [...presetsRef.current, copy];
    presetsRef.current = next;
    setPresets(next);
    void savePresets(next);
    return id;
  }, []);

  const deletePreset = useCallback(async (id: string) => {
    if (presetsRef.current.length <= 1) return;
    const next = presetsRef.current.filter((p) => p.id !== id);
    presetsRef.current = next;
    setPresets(next);
    await savePresets(next);
    if (settingsRef.current.activePresetId === id) {
      const fixed = { ...settingsRef.current, activePresetId: next[0].id };
      settingsRef.current = fixed;
      setSettings(fixed);
      await saveSettings(fixed);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, presets, loaded, save, savePreset, addPreset, deletePreset }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useTimerSettings() {
  return useContext(SettingsContext);
}
