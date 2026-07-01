'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/lib/use-session';

/** 로그인 안 되어 있으면 /login 으로 보낸다. */
export function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return <div className="p-10 text-slate-500">불러오는 중…</div>;
  }
  return <>{children}</>;
}
