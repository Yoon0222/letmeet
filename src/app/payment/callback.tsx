import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelPendingPayment, confirmTossPayment } from '@/lib/payments';
import { AppColors } from '@/theme';

type Params = {
  paymentId?: string | string[];
  url?: string | string[];
  paymentKey?: string | string[];
  orderId?: string | string[];
  amount?: string | string[];
  code?: string | string[];
  message?: string | string[];
};

function first(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function readTossResult(params: Params) {
  const directPaymentId = first(params.paymentId);
  const directPaymentKey = first(params.paymentKey);
  const directOrderId = first(params.orderId);
  const directAmount = Number(first(params.amount));

  if (directOrderId && Number.isFinite(directAmount) && directAmount > 0) {
    return {
      paymentId: directPaymentId,
      paymentKey: directPaymentKey,
      orderId: directOrderId,
      amount: directAmount,
    };
  }

  const rawUrl = first(params.url);
  if (!rawUrl) return null;

  const decodedUrl = decodeURIComponent(rawUrl);
  const queryString = decodedUrl.includes('?') ? decodedUrl.slice(decodedUrl.indexOf('?') + 1) : '';
  const search = new URLSearchParams(queryString);
  const paymentId = search.get('paymentId') ?? directPaymentId;
  const paymentKey = search.get('paymentKey') ?? undefined;
  const orderId = search.get('orderId') ?? undefined;
  const amount = Number(search.get('amount'));

  if (!orderId || !Number.isFinite(amount) || amount <= 0) return null;
  return { paymentId, paymentKey, orderId, amount };
}

function readTossFailure(params: Params) {
  const directPaymentId = first(params.paymentId);
  const directCode = first(params.code);
  const directMessage = first(params.message);

  if (directCode || directMessage) {
    return {
      paymentId: directPaymentId,
      message: decodeURIComponent(directMessage ?? '결제가 취소되었거나 실패했습니다.'),
    };
  }

  const rawUrl = first(params.url);
  if (!rawUrl) return null;

  const decodedUrl = decodeURIComponent(rawUrl);
  const queryString = decodedUrl.includes('?') ? decodedUrl.slice(decodedUrl.indexOf('?') + 1) : '';
  const search = new URLSearchParams(queryString);
  const code = search.get('code');
  const message = search.get('message');

  if (!code && !message) return null;
  return {
    paymentId: search.get('paymentId') ?? directPaymentId,
    message: decodeURIComponent(message ?? '결제가 취소되었거나 실패했습니다.'),
  };
}

export default function TossPaymentCallbackRoute() {
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const [message, setMessage] = useState('결제 결과를 확인하고 있어요.');
  const result = useMemo(() => readTossResult(params), [params]);

  useEffect(() => {
    let mounted = true;

    async function confirm() {
      const failure = readTossFailure(params);
      if (failure) {
        if (failure.paymentId) {
          await cancelPendingPayment(failure.paymentId);
        }
        setMessage(failure.message);
        return;
      }

      if (!result) {
        console.warn('[payment] callback missing result', params);
        setMessage('결제 결과를 찾지 못했어요. 내 예약 화면에서 예약 상태를 확인해주세요.');
        return;
      }

      try {
        await confirmTossPayment(result);
        if (!mounted) return;
        setMessage('결제가 확인되어 예약이 완료되었습니다.');
        router.replace('/court/reservations');
      } catch (error) {
        if (!mounted) return;
        console.warn('[payment] callback confirm failed', error);
        setMessage(error instanceof Error ? error.message : '결제 확인에 실패했어요.');
      }
    }

    confirm();

    return () => {
      mounted = false;
    };
  }, [params, result, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen
        options={{
          title: '결제 확인',
          headerStyle: { backgroundColor: AppColors.background },
          headerTintColor: AppColors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.center}>
        <ActivityIndicator color={AppColors.primary} />
        <Text style={styles.message}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: AppColors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  message: {
    color: AppColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
