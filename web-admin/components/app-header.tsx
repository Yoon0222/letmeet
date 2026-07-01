'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

export function AppHeader() {
  const { session } = useSession();
  const router = useRouter();

  async function logout() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white">🎾</span>
          피클 대회 관리자
        </Link>
        {session && (
          <div className="flex items-center gap-4 text-sm">
            <Link href="/tournaments" className="text-slate-600 hover:text-slate-900">
              대회
            </Link>
            <span className="text-slate-400">{session.user.email}</span>
            <button onClick={logout} className="text-slate-500 hover:text-slate-900">
              로그아웃
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
