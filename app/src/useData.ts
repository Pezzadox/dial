import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

/** Loads data and reloads it whenever the data source reports a change. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => { load().then((d) => { setData(d); setError(null); }).catch((e) => setError(String(e?.message ?? e))); }, deps);
  useEffect(() => { run(); return api.subscribe(run); }, [run]);
  return { data, error, reload: run };
}
