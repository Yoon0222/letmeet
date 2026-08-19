export type ActiveCourtPaymentReturn = {
  paymentId: string;
  orderId: string;
  orderName: string;
  amount: string;
};

let activeCourtPaymentReturn: ActiveCourtPaymentReturn | null = null;

export function setActiveCourtPaymentReturn(payment: ActiveCourtPaymentReturn | null) {
  activeCourtPaymentReturn = payment;
}

export function getActiveCourtPaymentReturn() {
  return activeCourtPaymentReturn;
}

export function isBarePaymentAppReturn(url: string) {
  return url === 'pickleball://' || url === 'pickleball:/';
}
