'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useRole } from '@/lib/use-role';
import { useSession } from '@/lib/use-session';

/**
 * 로그인 + 역할 게이트.
 * 기본: 대회 운영 권한(organizer 이상)만 접근. player 는 "권한 없음".
 * superAdmin: super_admin 전용.
 */
export function Protected({
  children,
  superAdmin = false,
}: {
  children: React.ReactNode;
  superAdmin?: boolean;
}) {
  const { session, loading: sLoading } = useSession();
  const { role, loading: rLoading } = useRole();
  const router = useRouter();
  const loading = sLoading || rLoading;

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  if (loading || !session) {
    return <div className="p-10 text-slate-500">불러오는 중…</div>;
  }

  const allowed = superAdmin ? role === 'super_admin' : role !== 'player' && role !== null;
  if (!allowed) {
    return (
      <div className="mx-auto mt-16 max-w-md text-center">
        <h1 className="text-xl font-semibold">접근 권한이 없어요</h1>
        <p className="mt-2 text-sm text-slate-500">
          {superAdmin
            ? '슈퍼관리자만 접근할 수 있는 화면입니다.'
            : '대회 운영 권한(주최자 이상)이 필요합니다. 관리자에게 문의하세요.'}
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
