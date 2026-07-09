import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  sanitizeSettings,
  type TimerSettings,
} from './settings';

type SettingsContextValue = {
  settings: TimerSettings;
  /** true olana kadar kalıcı ayarlar henüz okunmadı (varsayılanlar gösterilir). */
  loaded: boolean;
  save: (next: TimerSettings) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  save: async () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<TimerSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (!cancelled) {
        setSettings(s);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: TimerSettings) => {
    const clean = sanitizeSettings(next);
    setSettings(clean);
    await saveSettings(clean);
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loaded, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useTimerSettings() {
  return useContext(SettingsContext);
}
