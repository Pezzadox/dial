import { useCallback, useEffect, useState } from 'react';
import { quick } from './api';

/** Loads Quick Dial data and reloads whenever it changes. */
export function useQuick<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => { load().then(setData).catch(() => {}); }, deps);
  useEffect(() => { run(); return quick.subscribe(run); }, [run]);
  return { data, reload: run };
}
