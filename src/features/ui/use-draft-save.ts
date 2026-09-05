import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';
import { createDeferredWrite } from './deferred-write';

export function useDraftSave(scope: string | undefined) {
  const writer = useMemo(() => createDeferredWrite(), []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') writer.flush();
    });
    return () => { subscription.remove(); writer.flush(); };
  }, [scope, writer]);
  return writer;
}
