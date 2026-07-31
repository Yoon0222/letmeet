'use client';

// 토스 결제창(Payment Window) 실행 페이지 — 결제수단 "선택"은 앱이 네이티브로 하고,
// 여기서는 선택된 수단(method/easyPay)으로 곧장 토스 결제창을 띄운다.
//   · CARD                 → 카드 입력창(토스 웹)
//   · TRANSFER             → 계좌이체
//   · CARD + easyPay=KAKAOPAY 등 → 해당 간편결제(앱 실행)
// 성공/실패 시 successUrl/failUrl 로 리다이렉트 → 앱 WebView 가 가로채 서버 승인.
// API 개별 연동 키(NEXT_PUBLIC_TOSS_CLIENT_KEY, test_ck_/live_ck_) 사용.
import { useEffect, useRef, useState } from 'react';

const SDK_SRC = 'https://js.tosspayments.com/v2/standard';

type RequestPaymentOptions = {
  method: string;
  amount: { value: number; currency: string };
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  card?: { easyPay?: string };
};
type TossPaymentsFn = (clientKey: string) => {
  payment: (opts: { customerKey: string }) => {
    requestPayment: (opts: RequestPaymentOptions) => Promise<void>;
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
  return {
    orderId: p.get('orderId') ?? '',
    amount: Number(p.get('amount') ?? '0'),
    orderName: p.get('orderName') ?? '피넛 결제',
    successUrl: p.get('successUrl') ?? '',
    failUrl: p.get('failUrl') ?? '',
    method: (p.get('method') ?? 'CARD').toUpperCase(), // CARD | TRANSFER
    easyPay: p.get('easyPay') ?? '', // KAKAOPAY | NAVERPAY | TOSSPAY | PAYCO ...
  };
}

export default function PaymentCheckoutPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? '';

  useEffect(() => {
    if (!document.querySelector(`script[src="${SDK_SRC}"]`)) {
      const s = document.createElement('script');
      s.src = SDK_SRC;
      s.async = true;
      s.onerror = () => setError('결제 모듈을 불러오지 못했어요. 네트워크를 확인해주세요.');
      document.body.appendChild(s);
    }
    let tries = 0;
    const timer = setInterval(() => {
      if (window.TossPayments) {
        clearInterval(timer);
        setReady(true);
      } else if (++tries > 100) {
        clearInterval(timer);
        setError('결제 모듈을 불러오지 못했어요. 네트워크를 확인해주세요.');
      }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  // 준비되면 자동으로 결제창을 연다(수단은 앱에서 이미 골랐으므로 중간 화면 없음).
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
    if (!clientKey || !window.TossPayments) {
      setError('결제 설정이 없어요. 관리자에게 문의해주세요.');
      return;
    }
    try {
      const payment = window.TossPayments(clientKey).payment({ customerKey: 'ANONYMOUS' });
      const opts: RequestPaymentOptions = {
        method: params.method === 'TRANSFER' ? 'TRANSFER' : 'CARD',
        amount: { value: params.amount, currency: 'KRW' },
        orderId: params.orderId,
        orderName: params.orderName,
        successUrl: params.successUrl,
        failUrl: params.failUrl,
      };
      // 간편결제(카카오페이 등)는 CARD + easyPay 로 해당 수단으로 직행
      if (params.easyPay) opts.card = { easyPay: params.easyPay };
      await payment.requestPayment(opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : '결제를 진행하지 못했어요.');
    }
  }

  const params = getParams();

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#F6F7F9', color: '#111827', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, background: '#FFFFFF', borderRadius: 20, padding: 28, boxShadow: '0 8px 30px rgba(0,0,0,0.06)', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>결제 진행</h1>
        {params ? (
          <>
            <p style={{ marginTop: 10, color: '#6B7280', fontSize: 15 }}>{params.orderName}</p>
            <p style={{ marginTop: 4, fontSize: 28, fontWeight: 800 }}>{params.amount.toLocaleString()}원</p>
          </>
        ) : null}
        <button
          onClick={pay}
          disabled={!ready}
          style={{ marginTop: 20, width: '100%', height: 54, border: 'none', borderRadius: 14, background: ready ? '#3B4BF6' : '#C7CDD4', color: '#FFFFFF', fontSize: 16, fontWeight: 800, cursor: ready ? 'pointer' : 'default' }}>
          {!ready ? '결제 준비 중…' : error ? '다시 시도' : '결제창 여는 중…'}
        </button>
        {error ? <p style={{ marginTop: 14, color: '#E5484D', fontSize: 14 }}>{error}</p> : null}
        <p style={{ marginTop: 16, color: '#9CA3AF', fontSize: 12 }}>토스페이먼츠로 안전하게 결제됩니다.</p>
      </div>
    </main>
  );
}
