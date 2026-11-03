import { useEffect, useState } from 'react';

export type AsyncData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'success'; data: T };

/**
 * 非同期にデータを読み込む。loadが変わると読み直す（呼び出し側でuseCallbackを使う）。
 */
export function useAsyncData<T>(load: () => Promise<T>): AsyncData<T> {
  const [state, setState] = useState<{ load: () => Promise<T>; value: AsyncData<T> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setState({ load, value: { status: 'success', data } });
      },
      (error: unknown) => {
        if (!cancelled) setState({ load, value: { status: 'error', error } });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  if (!state || state.load !== load) return { status: 'loading' };
  return state.value;
}
