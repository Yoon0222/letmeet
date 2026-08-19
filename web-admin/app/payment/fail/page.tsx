import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PaymentReturnClient } from '../return-client';

export const metadata: Metadata = {
  title: '결제 실패 | 피넛',
  description: '피넛 앱에서 결제 실패 내용을 확인합니다.',
};

export default function PaymentFailPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnClient kind="fail" />
    </Suspense>
  );
}
