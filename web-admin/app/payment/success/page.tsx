import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PaymentReturnClient } from '../return-client';

export const metadata: Metadata = {
  title: '결제 확인 | 피넛',
  description: '피넛 앱에서 결제 결과를 확인합니다.',
};

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnClient kind="success" />
    </Suspense>
  );
}
