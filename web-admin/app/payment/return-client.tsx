'use client';

import Link from 'next/link';
import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

type PaymentReturnClientProps = {
  kind: 'success' | 'fail';
};

const APP_CALLBACK_URL = 'pickleball://payment/callback';

function buildAppUrl(search: string) {
  return `${APP_CALLBACK_URL}${search ? `?${search}` : ''}`;
}

export function PaymentReturnClient({ kind }: PaymentReturnClientProps) {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const appUrl = useMemo(() => buildAppUrl(search), [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = appUrl;
    }, 250);

    return () => window.clearTimeout(timer);
  }, [appUrl]);

  const isSuccess = kind === 'success';

  return (
    <main className="min-h-screen bg-[#070A0D] px-6 py-12 text-white">
      <section className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
        <div className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#16C784] text-lg font-black text-white">
          P!
        </div>
        <p className="text-sm font-extrabold uppercase tracking-[0.18em] text-[#16C784]">
          {isSuccess ? 'Payment approved' : 'Payment failed'}
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight">
          {isSuccess ? '결제 결과를 앱에서 확인합니다.' : '결제 실패 내용을 앱에서 확인합니다.'}
        </h1>
        <p className="mt-5 text-base font-semibold leading-7 text-[#A3AAB5]">
          피넛 앱으로 자동 이동하지 않으면 아래 버튼을 눌러주세요.
        </p>
        <a
          href={appUrl}
          className="mt-8 inline-flex h-14 items-center justify-center rounded-[18px] bg-[#16C784] px-6 text-base font-extrabold text-white"
        >
          피넛 앱으로 돌아가기
        </a>
        <Link href="/" className="mt-4 text-center text-sm font-bold text-[#6B7280]">
          홈페이지로 이동
        </Link>
      </section>
    </main>
  );
}
