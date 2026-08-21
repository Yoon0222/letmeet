import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { isBarePaymentAppReturn, setActiveCourtPaymentReturn } from '@/lib/payment-return-state';
import { cancelPendingPayment, confirmTossPayment, isTossConfigured, tossClientKey } from '@/lib/payments';
import { AppColors } from '@/theme';

type Params = {
  paymentId?: string;
  orderId?: string;
  orderName?: string;
  amount?: string;
};

const APP_URL_PREFIX = 'pickleball://';
const SUCCESS_URL = 'https://pinut.org/payment/success';
const FAIL_URL = 'https://pinut.org/payment/fail';

function appendParams(url: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `${url}?${search.toString()}`;
}

function htmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

function getQuery(url: string) {
  const questionIndex = url.indexOf('?');
  if (questionIndex < 0) return new URLSearchParams();
  return new URLSearchParams(url.slice(questionIndex + 1));
}

function unwrapPaymentRedirect(url: string) {
  if (!url.startsWith(APP_URL_PREFIX)) return url;
  const nestedUrl = getQuery(url).get('url');
  return nestedUrl ? decodeURIComponent(nestedUrl) : url;
}

function hasSuccessParams(url: string) {
  const query = getQuery(url);
  return Boolean(query.get('paymentKey') && query.get('orderId') && query.get('amount'));
}

function hasFailureParams(url: string) {
  const query = getQuery(url);
  return Boolean(query.get('code') || query.get('message'));
}

function convertIntentUrl(url: string) {
  const intentIndex = url.indexOf('#Intent;');
  if (!url.startsWith('intent://') || intentIndex < 0) {
    return { appUrl: url, packageName: undefined as string | undefined };
  }

  const appLink = url.slice('intent://'.length, intentIndex);
  const intentPart = url.slice(intentIndex);
  const scheme = intentPart.match(/;scheme=([^;]+)/)?.[1];
  const packageName = intentPart.match(/;package=([^;]+)/)?.[1];
  const fallbackUrl = intentPart.match(/;S\.browser_fallback_url=([^;]+)/)?.[1];

  return {
    appUrl: scheme ? `${scheme}://${appLink}` : fallbackUrl ? decodeURIComponent(fallbackUrl) : url,
    packageName,
  };
}

async function openExternalPaymentUrl(url: string) {
  const { appUrl, packageName } = convertIntentUrl(url);

  try {
    await Linking.openURL(appUrl);
  } catch (error) {
    console.warn('[payment] external app open failed', { url, appUrl, packageName, error });
    if (Platform.OS === 'android' && packageName) {
      await Linking.openURL(`market://details?id=${packageName}`);
    }
  }
}

function createPaymentHtml(args: {
  clientKey: string;
  customerKey: string;
  paymentId: string;
  orderId: string;
  orderName: string;
  amount: number;
  customerName?: string;
  customerEmail?: string;
}) {
  const successUrl = appendParams(SUCCESS_URL, { paymentId: args.paymentId });
  const failUrl = appendParams(FAIL_URL, { paymentId: args.paymentId, orderId: args.orderId });
  const title = htmlEscape(args.orderName);
  const amountLabel = `${args.amount.toLocaleString('ko-KR')}원`;

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <script src="https://js.tosspayments.com/v2/standard"></script>
  <style>
    :root {
      color-scheme: dark;
      --green: #16C784;
      --green-soft: rgba(22, 199, 132, 0.14);
      --bg: #05080A;
      --surface: #0E141A;
      --surface-2: #151C24;
      --line: rgba(255, 255, 255, 0.09);
      --text: #F9FAFB;
      --sub: #A3AAB5;
      --muted: #6B7280;
      --warning: #FBBF24;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 82% 8%, rgba(22,199,132,0.22), transparent 28%),
        linear-gradient(180deg, #07100D 0%, var(--bg) 34%, var(--bg) 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      min-height: 100vh;
      padding: 24px 24px calc(96px + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 2px;
    }
    .wordmark {
      font-size: 18px;
      font-weight: 900;
      letter-spacing: 0;
    }
    .wordmark span { color: var(--green); }
    .secure {
      padding: 7px 10px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: rgba(255,255,255,0.04);
      color: var(--sub);
      font-size: 11px;
      font-weight: 800;
    }
    .hero {
      padding: 24px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: linear-gradient(145deg, rgba(18,26,34,0.96), rgba(11,16,21,0.96));
      box-shadow: 0 22px 50px rgba(0,0,0,0.32);
    }
    .eyebrow {
      color: var(--green);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 12px 0 10px;
      font-size: 42px;
      line-height: 1;
      letter-spacing: 0;
    }
    .order {
      margin: 0;
      color: var(--sub);
      font-size: 14px;
      font-weight: 800;
    }
    .panel {
      padding: 20px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: rgba(18,26,34,0.94);
    }
    .notice {
      padding: 13px 14px;
      border-radius: 16px;
      background: rgba(254,243,199,0.12);
      color: var(--warning);
      font-size: 13px;
      font-weight: 800;
      line-height: 1.45;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin: 16px 0 18px;
    }
    .tile {
      min-height: 72px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(255,255,255,0.04);
    }
    .tile small {
      display: block;
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .tile strong {
      color: var(--text);
      font-size: 14px;
      font-weight: 900;
    }
    .button {
      width: 100%;
      height: 58px;
      border: 0;
      border-radius: 18px;
      background: var(--green);
      color: #FFFFFF;
      font-size: 16px;
      font-weight: 900;
      box-shadow: 0 16px 36px rgba(22,199,132,0.22);
      margin-top: 10px;
    }
    .button.secondary {
      background: var(--surface-2);
      color: var(--text);
      border: 1px solid var(--line);
      box-shadow: none;
    }
    .button:disabled {
      opacity: 0.55;
      box-shadow: none;
    }
    .methods {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      margin-top: 16px;
    }
    .method {
      height: 54px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: rgba(255,255,255,0.05);
      color: var(--text);
      font-size: 14px;
      font-weight: 900;
    }
    .method.active {
      border-color: var(--green);
      background: var(--green-soft);
      color: var(--green);
    }
    .terms {
      margin: 14px 2px 0;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.5;
      font-weight: 700;
      text-align: center;
    }
    .message {
      min-height: 20px;
      margin: 14px 0 0;
      color: var(--sub);
      font-size: 12px;
      font-weight: 800;
      text-align: center;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <div class="wordmark">P<span>!</span>NUT</div>
      <div class="secure">Toss secure</div>
    </div>

    <section class="hero">
      <div class="eyebrow">Payment</div>
      <h1>${amountLabel}</h1>
      <p class="order">${title}</p>
    </section>

    <section class="panel">
      <div class="notice">테스트 환경입니다. 실제로 결제되지 않아요.</div>
      <div class="summary">
        <div class="tile">
          <small>주문번호</small>
          <strong>${htmlEscape(args.orderId.slice(-10))}</strong>
        </div>
        <div class="tile">
          <small>결제상태</small>
          <strong>승인 대기</strong>
        </div>
      </div>
      <div class="methods">
        <button class="method active" type="button" data-pay-kind="easyPay" data-pay-value="토스페이" data-pay-label="토스페이">토스페이</button>
        <button class="method" type="button" data-pay-kind="easyPay" data-pay-value="카카오페이" data-pay-label="카카오페이">카카오페이</button>
        <button class="method" type="button" data-pay-kind="easyPay" data-pay-value="네이버페이" data-pay-label="네이버페이">네이버페이</button>
        <button class="method" type="button" data-pay-kind="easyPay" data-pay-value="페이코" data-pay-label="PAYCO">PAYCO</button>
        <button class="method" type="button" data-pay-kind="easyPay" data-pay-value="삼성페이" data-pay-label="삼성페이">삼성페이</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="현대" data-pay-label="현대카드">현대카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="삼성" data-pay-label="삼성카드">삼성카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="신한" data-pay-label="신한카드">신한카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="국민" data-pay-label="국민카드">국민카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="BC">BC카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="롯데" data-pay-label="롯데카드">롯데카드</button>
        <button class="method" type="button" data-pay-kind="cardCompany" data-pay-value="농협" data-pay-label="농협카드">농협카드</button>
      </div>
      <button id="payButton" class="button" type="button">${amountLabel} 결제하기</button>
      <p class="terms">결제 진행 시 토스페이먼츠 전자금융거래 이용약관 및 개인정보 처리에 동의한 것으로 처리됩니다.</p>
      <p id="message" class="message">결제수단을 선택한 뒤 결제 버튼을 눌러주세요.</p>
    </section>
  </main>
  <script>
    const message = document.getElementById('message');
    const payButton = document.getElementById('payButton');
    const methodButtons = Array.from(document.querySelectorAll('[data-pay-kind][data-pay-value]'));
    let selectedPayKind = 'easyPay';
    let selectedPayValue = '토스페이';
    let selectedPayLabel = '토스페이';
    const paymentInfo = ${JSON.stringify({
      clientKey: args.clientKey,
      customerKey: args.customerKey,
      paymentId: args.paymentId,
      orderId: args.orderId,
      orderName: args.orderName,
      amount: args.amount,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      successUrl,
      failUrl,
    })};

    function setMessage(text) {
      message.textContent = text;
    }

    function setBusy(isBusy) {
      payButton.disabled = isBusy;
    }

    function selectPayMethod(kind, value, label) {
      selectedPayKind = kind;
      selectedPayValue = value;
      selectedPayLabel = label || value;
      methodButtons.forEach(function (button) {
        button.classList.toggle('active', button.dataset.payKind === kind && button.dataset.payValue === value);
      });
      setMessage(selectedPayLabel + ' 자체창으로 이동합니다.');
    }

    function getCardOptions() {
      const cardOptions = {
        useEscrow: false,
        flowMode: 'DIRECT',
        useCardPoint: false,
        useAppCardOnly: false,
      };

      if (selectedPayKind === 'cardCompany') {
        cardOptions.cardCompany = selectedPayValue;
      } else {
        cardOptions.easyPay = selectedPayValue;
      }

      return cardOptions;
    }

    async function requestPayment() {
      setBusy(true);
      setMessage(selectedPayLabel + ' 자체창을 여는 중입니다.');

      try {
        const tossPayments = TossPayments(paymentInfo.clientKey);
        const payment = tossPayments.payment({ customerKey: paymentInfo.customerKey });
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAYMENT_REQUEST_START',
          mode: selectedPayKind + ':' + selectedPayValue,
          label: selectedPayLabel,
          card: getCardOptions(),
        }));
        await payment.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: paymentInfo.amount },
          orderId: paymentInfo.orderId,
          orderName: paymentInfo.orderName,
          successUrl: paymentInfo.successUrl,
          failUrl: paymentInfo.failUrl,
          customerName: paymentInfo.customerName,
          customerEmail: paymentInfo.customerEmail,
          card: getCardOptions(),
        });
      } catch (error) {
        setBusy(false);
        setMessage(error && error.message ? error.message : '결제창을 열지 못했어요.');
        window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAYMENT_WINDOW_ERROR',
          mode: selectedPayKind + ':' + selectedPayValue,
          label: selectedPayLabel,
          message: error && error.message ? error.message : String(error),
        }));
      }
    }

    methodButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        selectPayMethod(
          button.dataset.payKind || 'easyPay',
          button.dataset.payValue || '토스페이',
          button.dataset.payLabel || button.textContent || '토스페이'
        );
      });
    });
    payButton.addEventListener('click', function () { requestPayment(); });
  </script>
</body>
</html>`;
}

export default function CourtPaymentRoute() {
  const { profile, session } = useAuth();
  const params = useLocalSearchParams<Params>();
  const router = useRouter();
  const paymentId = String(params.paymentId ?? '');
  const orderId = String(params.orderId ?? '');
  const orderName = String(params.orderName ?? '코트 예약');
  const amount = Number(params.amount ?? 0);
  const customerKey = session?.user.id ?? 'anonymous';
  const confirmingRef = useRef(false);
  const completedRef = useRef(false);
  const exitingRef = useRef(false);
  const successRouteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [paymentFinished, setPaymentFinished] = useState(false);
  const [statusText, setStatusText] = useState('결제창을 준비하고 있어요.');

  const valid = isTossConfigured && paymentId && orderId && amount > 0;
  const paymentHtml = useMemo(
    () =>
      createPaymentHtml({
        clientKey: tossClientKey,
        customerKey,
        paymentId,
        orderId,
        orderName,
        amount,
        customerName: profile?.nickname ?? undefined,
        customerEmail: session?.user.email ?? undefined,
      }),
    [amount, customerKey, orderId, orderName, paymentId, profile?.nickname, session?.user.email],
  );

  const confirmPaymentResult = useCallback(
    async (args?: { paymentKey?: string; orderId?: string; amount?: number }) => {
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      setConfirming(true);
      setStatusText('결제 승인 정보를 확인하고 있어요.');

      try {
        const returnedPaymentKey = args?.paymentKey;
        const returnedOrderId = args?.orderId ?? orderId;
        const returnedAmount = args?.amount ?? amount;

        if (returnedOrderId !== orderId || returnedAmount !== amount) {
          throw new Error('결제 주문 정보가 예약 정보와 일치하지 않아요.');
        }


        const result = await confirmTossPayment({
          paymentId,
          paymentKey: returnedPaymentKey,
          orderId: returnedOrderId,
          amount: returnedAmount,
        });

        if (!result.ok) {
          confirmingRef.current = false;
          setStatusText(result.message ?? '결제 결과를 조금 더 기다리고 있어요.');
          return;
        }

        completedRef.current = true;
        setPaymentFinished(true);
        setActiveCourtPaymentReturn(null);
        setStatusText('예약이 완료되었습니다. 내 예약으로 이동합니다.');
        successRouteTimerRef.current = setTimeout(() => {
          router.replace('/court/reservations');
        }, 900);
      } catch (error) {
        confirmingRef.current = false;
        const message = error instanceof Error ? error.message : '결제 확인에 실패했어요.';
        setStatusText(message);
        Alert.alert('결제 확인 실패', message);
      } finally {
        setConfirming(false);
      }
    },
    [amount, orderId, paymentId, router],
  );

  const confirmSuccess = useCallback(
    async (url: string) => {
      const normalizedUrl = unwrapPaymentRedirect(url);
      const query = getQuery(normalizedUrl);
      const returnedPaymentKey = query.get('paymentKey') ?? undefined;
      const returnedOrderId = query.get('orderId') ?? orderId;
      const returnedAmount = Number(query.get('amount') ?? amount);

      await confirmPaymentResult({
        paymentKey: returnedPaymentKey,
        orderId: returnedOrderId,
        amount: returnedAmount,
      });
    },
    [amount, confirmPaymentResult, orderId],
  );

  const handleFailure = useCallback(
    async (url: string) => {
      if (confirmingRef.current) return;
      confirmingRef.current = true;
      const normalizedUrl = unwrapPaymentRedirect(url);
      const query = getQuery(normalizedUrl);
      const message = query.get('message')
        ? decodeURIComponent(query.get('message') ?? '')
        : '결제가 취소되었거나 실패했습니다.';

      await cancelPendingPayment(paymentId);
      setStatusText(message);
      setActiveCourtPaymentReturn(null);
      Alert.alert('결제 실패', message, [{ text: '확인', onPress: () => router.replace('/court') }]);
    },
    [paymentId, router],
  );

  const handleIncomingUrl = useCallback(
    (url: string) => {
      if (completedRef.current || exitingRef.current) return true;

      const normalizedUrl = unwrapPaymentRedirect(url);

      if (isBarePaymentAppReturn(normalizedUrl)) {
        setStatusText('결제 앱에서 돌아왔어요. 결제창의 완료 화면을 기다리고 있습니다.');
        return true;
      }

      if (normalizedUrl.startsWith(SUCCESS_URL) || hasSuccessParams(normalizedUrl)) {
        void confirmSuccess(normalizedUrl);
        return true;
      }
      if (normalizedUrl.startsWith(FAIL_URL) || hasFailureParams(normalizedUrl)) {
        void handleFailure(normalizedUrl);
        return true;
      }
      return false;
    },
    [confirmSuccess, handleFailure],
  );

  const shouldStartLoad = useCallback(
    (request: { url?: string }) => {
      const url = request.url;
      if (!url || url === 'undefined') return false;
      if (completedRef.current || exitingRef.current) return false;

      if (handleIncomingUrl(url)) return false;

      const lowerUrl = url.toLowerCase();
      const isWebUrl =
        lowerUrl.startsWith('http://') ||
        lowerUrl.startsWith('https://') ||
        lowerUrl.startsWith('about:') ||
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('blob:') ||
        lowerUrl.startsWith('javascript:');

      if (isWebUrl) return true;

      void openExternalPaymentUrl(url);
      return false;
    },
    [handleIncomingUrl],
  );

  const leavePayment = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setActiveCourtPaymentReturn(null);
    setStatusText('결제를 취소하고 코트 예약으로 돌아갑니다.');

    if (!completedRef.current && paymentId) {
      void cancelPendingPayment(paymentId).finally(() => {
        router.replace('/court');
      });
      return;
    }

    router.replace('/court');
  }, [paymentId, router]);

  useEffect(() => {
    if (valid) {
      setActiveCourtPaymentReturn({
        paymentId,
        orderId,
        orderName,
        amount: String(amount),
      });
    }

    const subscription = Linking.addEventListener('url', (event) => {
      handleIncomingUrl(event.url);
    });

    return () => {
      subscription.remove();
      if (successRouteTimerRef.current) {
        clearTimeout(successRouteTimerRef.current);
        successRouteTimerRef.current = null;
      }
      setActiveCourtPaymentReturn(null);
    };
  }, [amount, handleIncomingUrl, orderId, orderName, paymentId, valid]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leavePayment();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [leavePayment]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen
          options={{
            title: '결제',
            headerStyle: { backgroundColor: AppColors.background },
            headerTintColor: AppColors.textPrimary,
            headerShadowVisible: false,
          }}
        />
        <View style={styles.center}>
          <Text style={styles.errorTitle}>결제를 시작할 수 없어요.</Text>
          <Text style={styles.errorText}>API 개별 연동 클라이언트 키 또는 주문 정보가 올바르지 않습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: '결제',
          headerStyle: { backgroundColor: AppColors.background },
          headerTintColor: AppColors.textPrimary,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.webviewWrap}>
        {paymentFinished ? (
          <View style={styles.finishedState}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.finishedTitle}>예약이 완료되었습니다.</Text>
            <Text style={styles.finishedText}>내 예약으로 이동하고 있어요.</Text>
          </View>
        ) : (
          <WebView
            source={{ html: paymentHtml, baseUrl: 'https://pinut.org' }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            mixedContentMode="always"
            setSupportMultipleWindows
            onShouldStartLoadWithRequest={shouldStartLoad}
            onOpenWindow={(event) => {
              const targetUrl = event.nativeEvent.targetUrl;
              if (!targetUrl || targetUrl === 'undefined') return;
              if (handleIncomingUrl(targetUrl)) return;
              void openExternalPaymentUrl(targetUrl);
            }}
            onMessage={() => {}}
            onLoadEnd={() => {
              if (!completedRef.current && !exitingRef.current) setStatusText('결제창이 준비되었습니다.');
            }}
            onError={(event) => {
              if (completedRef.current || exitingRef.current) return;
              const message = event.nativeEvent.description || '결제창을 불러오지 못했어요.';
              setStatusText(message);
              console.warn('[payment] api-window webview error', event.nativeEvent);
            }}
          />
        )}
        <View pointerEvents="none" style={styles.statusBar}>
          {confirming ? <ActivityIndicator color={AppColors.primary} /> : null}
          <Text style={styles.statusText}>{statusText}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  errorTitle: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800' },
  errorText: { color: AppColors.textSecondary, fontSize: 14, marginTop: Spacing.two, textAlign: 'center' },
  webviewWrap: { flex: 1, backgroundColor: AppColors.background },
  finishedState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  finishedTitle: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800' },
  finishedText: { color: AppColors.textSecondary, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  statusBar: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    backgroundColor: 'rgba(7, 10, 13, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  statusText: {
    color: AppColors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
