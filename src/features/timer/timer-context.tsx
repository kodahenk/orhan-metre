import { createContext, useContext, type ReactNode } from 'react';

import { useWorkTimer } from './use-work-timer';

type TimerValue = ReturnType<typeof useWorkTimer>;

const TimerContext = createContext<TimerValue | null>(null);

/**
 * Zamanlayıcı motoru uygulama kökünde yaşar: ekranlar arasında gezinmek
 * (ana sayfa ↔ zamanlayıcı ↔ ayarlar) oturumu bozmaz.
 */
export function TimerProvider({ children }: { children: ReactNode }) {
  const timer = useWorkTimer();
  return <TimerContext.Provider value={timer}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerValue {
  const value = useContext(TimerContext);
  if (!value) throw new Error('useTimer, TimerProvider içinde kullanılmalı');
  return value;
}
