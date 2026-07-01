'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useSession } from '@/lib/use-session';

export default function Home() {
  const { session, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(session ? '/tournaments' : '/login');
  }, [session, loading, router]);

  return <div className="text-slate-500">불러오는 중…</div>;
}
