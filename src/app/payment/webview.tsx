import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { ActivityIndicator, Alert, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { supabase } from '@/lib/supabase';

// 인앱 결제 WebView. 토스 체크아웃 페이지를 앱 안에서 띄우고,
// 성공/실패 리다이렉트를 내부에서 가로채 서버 승인(pay-verify) 후 앱 화면으로 복귀한다.
// (외부 브라우저·딥링크·"앱 열기" 프롬프트 없음)
const BASE = process.env.EXPO_PUBLIC_PAYMENT_RETURN_BASE_URL ?? 'https://pinut.org/payment';

function qp(url: string, key: string): string | null {
  const m = url.match(new RegExp('[?&]' + key + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function PaymentWebview() {
  const params = useLocalSearchParams<{ orderId?: string; amount?: string; orderName?: string; pid?: string }>();
  const router = useRouter();
  const handled = useRef(false);

  const orderId = String(params.orderId ?? '');
  const amount = String(params.amount ?? '');
  const orderName = String(params.orderName ?? '피넛 코트 예약');
  const pid = String(params.pid ?? '');

  const successUrl = `${BASE}/success`;
  const failUrl = `${BASE}/fail`;
  const checkoutUrl =
    `${BASE}/checkout?orderId=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(amount)}` +
    `&orderName=${encodeURIComponent(orderName)}&successUrl=${encodeURIComponent(successUrl)}&failUrl=${encodeURIComponent(failUrl)}`;

  async function releaseHold() {
    if (!pid) return;
    await supabase.from('court_reservations').delete().eq('payment_id', pid);
    await supabase.from('payments').update({ status: 'canceled' }).eq('id', pid);
  }

  function finishFail(msg: string) {
    router.back();
    setTimeout(() => Alert.alert('결제 실패', msg), 300);
  }

  // WebView 가 이동하려는 URL 을 가로챈다. success/fail 은 앱 내부에서 처리(로드 차단).
  function onRequest(req: { url: string }): boolean {
    const url = req.url;

    // 카드사 앱·간편결제 앱 스킴(intent://, supertoss:// 등)은 외부 앱으로 넘긴다
    if (!/^https?:/i.test(url) && !url.startsWith('about:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
      Linking.openURL(url).catch(() => {});
      return false;
    }

    if (url.startsWith(successUrl)) {
      if (handled.current) return false;
      handled.current = true;
      (async () => {
        const paymentKey = qp(url, 'paymentKey');
        const oid = qp(url, 'orderId') ?? orderId;
        const { data, error } = await supabase.functions.invoke('pay-verify', { body: { order_id: oid, paymentId: paymentKey } });
        if (!error && data?.paid) {
          router.replace('/court/reservations' as never);
          setTimeout(() => Alert.alert('결제 완료', '예약이 확정됐어요! 🎉'), 300);
        } else {
          await releaseHold();
          finishFail(data?.error ?? error?.message ?? '결제 승인에 실패했어요.');
        }
      })();
      return false;
    }

    if (url.startsWith(failUrl)) {
      if (handled.current) return false;
      handled.current = true;
      (async () => {
        await releaseHold();
        finishFail(qp(url, 'message') ?? '결제가 취소됐어요.');
      })();
      return false;
    }

    return true;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <WebView
        source={{ uri: checkoutUrl }}
        onShouldStartLoadWithRequest={onRequest}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.center}>
            <ActivityIndicator color="#16C784" />
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
});
