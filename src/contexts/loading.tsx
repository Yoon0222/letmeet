import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { LoadingOverlay } from '@/components/ui/loading-overlay';

interface LoadingContextValue {
  show: () => void;
  hide: () => void;
  /** 프로미스를 감싸 실행 동안 로딩 팝업을 띄운다. */
  withLoading: <T>(p: Promise<T>) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextValue | undefined>(undefined);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const show = useCallback(() => setCount((c) => c + 1), []);
  const hide = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);
  const withLoading = useCallback(
    async <T,>(p: Promise<T>): Promise<T> => {
      setCount((c) => c + 1);
      try {
        return await p;
      } finally {
        setCount((c) => Math.max(0, c - 1));
      }
    },
    [],
  );

  const value = useMemo(() => ({ show, hide, withLoading }), [show, hide, withLoading]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
      <LoadingOverlay visible={count > 0} />
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingContext);
  if (!ctx) throw new Error('useLoading 는 LoadingProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}
