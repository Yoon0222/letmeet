'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';

export default function LoginPage() {
  const router = useRouter();
  const { session } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) router.replace('/tournaments');
  }, [session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(/invalid login/i.test(error.message) ? '이메일 또는 비밀번호가 올바르지 않습니다.' : error.message);
      return;
    }
    router.replace('/tournaments');
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="text-xl font-semibold">관리자 로그인</h1>
      <p className="mt-1 text-sm text-slate-500">피클 앱과 동일한 계정으로 로그인하세요.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {loading ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </div>
  );
}
