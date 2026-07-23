'use client';

// 토스 결제창 호스팅 페이지.
// 앱(payments.ts)이 인앱 브라우저로 이 페이지를 열고, 토스 v2 SDK 로 결제창을 띄운다.
// 성공/실패 시 토스가 successUrl/failUrl(= /payment/success·fail 릴레이)로 리다이렉트하고,
// 릴레이가 앱 스킴으로 되돌려 앱이 pay-verify(/confirm) 로 서버 승인한다.
// 클라이언트 키(공개)는 web-admin env NEXT_PUBLIC_TOSS_CLIENT_KEY.
import { useEffect, useRef, useState } from 'react';

const SDK_SRC = 'https://js.tosspayments.com/v2/standard';

type TossPaymentsFn = (clientKey: string) => {
  payment: (opts: { customerKey: string }) => {
    requestPayment: (opts: {
      method: string;
      amount: { value: number; currency: string };
      orderId: string;
      orderName: string;
      successUrl: string;
      failUrl: string;
    }) => Promise<void>;
  };
};

declare global {
  interface Window {
    TossPayments?: TossPaymentsFn;
  }
}

function getParams() {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const orderId = p.get('orderId') ?? '';
  const amount = Number(p.get('amount') ?? '0');
  const orderName = p.get('orderName') ?? '피넛 결제';
  const successUrl = p.get('successUrl') ?? '';
  const failUrl = p.get('failUrl') ?? '';
  return { orderId, amount, orderName, successUrl, failUrl };
}

export default function PaymentCheckoutPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // 자동 실행 1회 가드(StrictMode 이중 렌더 방지)
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

  useEffect(() => {
    // 스크립트가 없으면 삽입
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = SDK_SRC;
      s.async = true;
      s.onerror = () => setError('결제 모듈을 불러오지 못했어요. 네트워크를 확인해주세요.');
      document.body.appendChild(s);
    }
    // window.TossPayments 가 실제로 준비될 때까지 폴링(onload/StrictMode 레이스 회피)
    let tries = 0;
    const timer = setInterval(() => {
      if (window.TossPayments) {
        clearInterval(timer);
        setReady(true);
      } else if (++tries > 100) {
        clearInterval(timer); // 10초 초과
        setError('결제 모듈을 불러오지 못했어요. 네트워크를 확인해주세요.');
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // SDK 준비되면 자동으로 토스 결제창을 연다(중간 버튼 없이). 실패 시 아래 '다시 시도' 폴백.
  useEffect(() => {
    if (ready && !started.current) {
      started.current = true;
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      pay();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function pay() {
    setError(null);
    const params = getParams();
    if (!params || !params.orderId || !params.amount || !params.successUrl || !params.failUrl) {
      setError('결제 정보가 올바르지 않아요.');
      return;
    }
    if (!clientKey) {
      setError('결제 설정(클라이언트 키)이 없어요. 관리자에게 문의해주세요.');
      return;
    }
    if (!window.TossPayments) {
      setError('결제 모듈이 아직 준비되지 않았어요.');
      return;
    }
    try {
      const toss = window.TossPayments(clientKey);
      const payment = toss.payment({ customerKey: 'ANONYMOUS' });
      await payment.requestPayment({
        method: 'CARD',
        amount: { value: params.amount, currency: 'KRW' },
        orderId: params.orderId,
        orderName: params.orderName,
        successUrl: params.successUrl,
        failUrl: params.failUrl,
      });
    } catch (e) {
      // 사용자가 결제창을 닫으면 여기로 온다(정상 취소).
      setError(e instanceof Error ? e.message : '결제를 진행하지 못했어요.');
    }
  }

  const params = getParams();

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#F6F7F9', color: '#111827', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 20, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>코트 예약 결제</h1>
        {params ? (
          <>
            <p style={{ marginTop: 10, color: '#6B7280', fontSize: 15 }}>{params.orderName}</p>
            <p style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{params.amount.toLocaleString()}원</p>
          </>
        ) : null}
        <button
          onClick={pay}
          disabled={!ready}
          style={{
            marginTop: 20,
            width: '100%',
            height: 54,
            border: 'none',
            borderRadius: 14,
            background: ready ? '#16C784' : '#C7CDD4',
            color: '#FFFFFF',
            fontSize: 16,
            fontWeight: 800,
            cursor: ready ? 'pointer' : 'default',
          }}>
          {!ready ? '결제 준비 중…' : error ? '다시 시도' : '결제창 열기'}
        </button>
        {error ? (
          <p style={{ marginTop: 14, color: '#E5484D', fontSize: 14 }}>{error}</p>
        ) : ready ? (
          <p style={{ marginTop: 14, color: '#6B7280', fontSize: 13 }}>결제창을 여는 중이에요…</p>
        ) : null}
        <p style={{ marginTop: 16, color: '#9CA3AF', fontSize: 12 }}>토스페이먼츠로 안전하게 결제됩니다.</p>
      </div>
    </main>
  );
}
