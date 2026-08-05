import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { clearPendingPayment, setPendingPayment } from '@/lib/pending-payment';
import { supabase } from '@/lib/supabase';

// 인앱 결제 WebView. 토스 체크아웃 페이지를 앱 안에서 띄우고,
// 성공/실패 리다이렉트를 내부에서 가로채 서버 승인(pay-verify) 후 앱 화면으로 복귀한다.
// (외부 브라우저·딥링크·"앱 열기" 프롬프트 없음)
const BASE = process.env.EXPO_PUBLIC_PAYMENT_RETURN_BASE_URL ?? 'https://pinut.org/payment';
// 외부 결제앱(카카오페이 등)에서 결제 후 우리 앱으로 복귀할 스킴. 이걸 토스에 넘겨야
// 카카오페이가 카카오톡이 아니라 피넛으로 돌아온다.
const APP_SCHEME = process.env.EXPO_PUBLIC_PAYMENT_APP_SCHEME ?? 'pickleball://';

function qp(url: string, key: string): string | null {
  const m = url.match(new RegExp('[?&]' + key + '=([^&#]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export default function PaymentWebview() {
  const params = useLocalSearchParams<{
    orderId?: string;
    amount?: string;
    orderName?: string;
    pid?: string;
    method?: string;
    easyPay?: string;
  }>();
  const router = useRouter();
  const handled = useRef(false);

  const orderId = String(params.orderId ?? '');
  const amount = String(params.amount ?? '');
  const orderName = String(params.orderName ?? '피넛 코트 예약');
  const pid = String(params.pid ?? '');
  const method = String(params.method ?? 'CARD');
  const easyPay = String(params.easyPay ?? '');

  const successUrl = `${BASE}/success`;
  const failUrl = `${BASE}/fail`;
  const checkoutUrl =
    `${BASE}/checkout?orderId=${encodeURIComponent(orderId)}&amount=${encodeURIComponent(amount)}` +
    `&orderName=${encodeURIComponent(orderName)}&successUrl=${encodeURIComponent(successUrl)}&failUrl=${encodeURIComponent(failUrl)}` +
    `&method=${encodeURIComponent(method)}&easyPay=${encodeURIComponent(easyPay)}` +
    `&appScheme=${encodeURIComponent(APP_SCHEME)}`;

  async function releaseHold() {
    if (!pid) return;
    await supabase.from('court_reservations').delete().eq('payment_id', pid);
    await supabase.from('payments').update({ status: 'canceled' }).eq('id', pid);
  }

  function finishFail(msg: string) {
    router.back();
    setTimeout(() => Alert.alert('결제 실패', msg), 300);
  }

  // success/fail URL 이면 앱 내부에서 처리하고 true 반환(= 가로챔). 아니면 false.
  function handleReturn(url: string): boolean {
    if (handled.current) return true;

    if (url.startsWith(successUrl)) {
      handled.current = true;
      (async () => {
        const paymentKey = qp(url, 'paymentKey');
        const oid = qp(url, 'orderId') ?? orderId;
        const { data, error } = await supabase.functions.invoke('pay-verify', { body: { order_id: oid, paymentId: paymentKey } });
        await clearPendingPayment();
        if (!error && data?.paid) {
          router.replace('/court/reservations' as never);
          setTimeout(() => Alert.alert('결제 완료', '예약이 확정됐어요! 🎉'), 300);
        } else {
          await releaseHold();
          finishFail(data?.error ?? error?.message ?? '결제 승인에 실패했어요.');
        }
      })();
      return true;
    }

    if (url.startsWith(failUrl)) {
      handled.current = true;
      (async () => {
        await clearPendingPayment();
        await releaseHold();
        finishFail(qp(url, 'message') ?? '결제가 취소됐어요.');
      })();
      return true;
    }

    return false;
  }

  // 안드로이드 앱 실행 URL(intent://) → 앱 스킴으로 변환해 열기(카카오페이·앱카드 등)
  function openIntent(url: string) {
    const scheme = url.match(/scheme=([^;]+)/)?.[1];
    const pkg = url.match(/package=([^;]+)/)?.[1];
    const fallback = url.match(/S\.browser_fallback_url=([^;]+)/)?.[1];
    const appUrl = scheme ? url.replace(/^intent:\/\//i, `${scheme}://`).split('#Intent')[0] : null;
    const openFallback = () => {
      if (fallback) Linking.openURL(decodeURIComponent(fallback)).catch(() => {});
      else if (pkg) Linking.openURL(`market://details?id=${pkg}`).catch(() => {});
    };
    if (appUrl) Linking.openURL(appUrl).catch(openFallback);
    else openFallback();
  }

  // 이동 직전 가로채기(+ 카드사·간편결제 앱 실행)
  function onRequest(req: { url: string }): boolean {
    const url = req.url;
    if (url.startsWith('intent://')) {
      openIntent(url);
      return false;
    }
    // 그 외 앱 스킴(kakaotalk://, supertoss://, ispmobile:// 등) → 외부 앱
    if (!/^https?:/i.test(url) && !url.startsWith('about:') && !url.startsWith('blob:') && !url.startsWith('data:')) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return !handleReturn(url); // 가로챘으면 로드 차단(false)
  }

  // 백업: 리다이렉트가 onRequest 를 안 거치는 경우(안드로이드 302/JS) 여기서 잡는다
  function onNav(state: WebViewNavigation) {
    handleReturn(state.url);
  }

  // 결제 시작 시 orderId 를 저장 → 외부 결제앱에서 돌아오면 PaymentResumeWatcher 가
  // 이 orderId 로 결제 성공을 서버 확인해 예약을 확정한다(딥링크 복귀가 흔들려도 안전).
  // ⚠️ 언마운트 시 releaseHold 하지 않는다: 앱2앱 복귀 확인이 방금 확정한 예약을
  //    삭제하는 사고를 막기 위해. 미결제로 남은 홀드는 서버 스테일 정리(cron)가 처리.
  useEffect(() => {
    if (orderId) void setPendingPayment({ orderId, orderName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <WebView
        source={{ uri: checkoutUrl }}
        onShouldStartLoadWithRequest={onRequest}
        onNavigationStateChange={onNav}
        setSupportMultipleWindows={false}
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
