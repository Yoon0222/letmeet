'use client';

import { useEffect } from 'react';

function buildRedirectUrl(searchParams: URLSearchParams) {
  const redirect = searchParams.get('redirect') ?? 'pickleball://payment/success';
  const url = new URL(redirect);
  searchParams.forEach((value, key) => {
    if (key !== 'redirect') url.searchParams.set(key, value);
  });
  return url.toString();
}

export default function PaymentSuccessPage() {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    window.location.href = buildRedirectUrl(searchParams);
  }, []);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#F6F7F9', color: '#111827' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>결제를 확인하고 있어요</h1>
        <p style={{ marginTop: 12, color: '#6B7280' }}>피넛 앱으로 돌아갑니다.</p>
      </div>
    </main>
  );
}
