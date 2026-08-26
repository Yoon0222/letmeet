import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { isTossConfigured, startClubSubscription, tossClientKey } from '@/lib/payments';
import { AppColors } from '@/theme';

const APP_URL_PREFIX = 'pickleball://';
const SUCCESS_URL = 'https://pinut.org/payment/success';
const FAIL_URL = 'https://pinut.org/payment/fail';
const AMOUNT = 5500;

function getQuery(url: string) {
  const i = url.indexOf('?');
  return i < 0 ? new URLSearchParams() : new URLSearchParams(url.slice(i + 1));
}
function unwrap(url: string) {
  if (!url.startsWith(APP_URL_PREFIX)) return url;
  const nested = getQuery(url).get('url');
  return nested ? decodeURIComponent(nested) : url;
}
function hasBillingSuccess(url: string) {
  const q = getQuery(url);
  return Boolean(q.get('authKey') && q.get('customerKey'));
}
function hasFailure(url: string) {
  const q = getQuery(url);
  return Boolean(q.get('code') || q.get('message'));
}
function convertIntentUrl(url: string) {
  const idx = url.indexOf('#Intent;');
  if (!url.startsWith('intent://') || idx < 0) return { appUrl: url, packageName: undefined as string | undefined };
  const appLink = url.slice('intent://'.length, idx);
  const part = url.slice(idx);
  const scheme = part.match(/;scheme=([^;]+)/)?.[1];
  const packageName = part.match(/;package=([^;]+)/)?.[1];
  const fallback = part.match(/;S\.browser_fallback_url=([^;]+)/)?.[1];
  return { appUrl: scheme ? `${scheme}://${appLink}` : fallback ? decodeURIComponent(fallback) : url, packageName };
}
async function openExternal(url: string) {
  const { appUrl, packageName } = convertIntentUrl(url);
  try {
    await Linking.openURL(appUrl);
  } catch {
    if (Platform.OS === 'android' && packageName) await Linking.openURL(`market://details?id=${packageName}`);
  }
}
function htmlEscape(v: string) {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function billingHtml(args: { clientKey: string; customerKey: string; clubName: string; customerName?: string; customerEmail?: string }) {
  const successUrl = `${SUCCESS_URL}?flow=billing`;
  const info = JSON.stringify({
    clientKey: args.clientKey,
    customerKey: args.customerKey,
    successUrl,
    failUrl: FAIL_URL,
    customerName: args.customerName,
    customerEmail: args.customerEmail,
  });
  return `<!doctype html><html lang="ko"><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<script src="https://js.tosspayments.com/v2/standard"></script>
<style>
  :root{color-scheme:dark;--green:#16C784;--bg:#05080A;--surface:#0E141A;--line:rgba(255,255,255,.09);--text:#F9FAFB;--sub:#A3AAB5;--muted:#6B7280;--warn:#FBBF24;}
  *{box-sizing:border-box;} body{margin:0;min-height:100vh;background:linear-gradient(180deg,#07100D 0%,var(--bg) 34%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
  main{min-height:100vh;padding:24px 24px calc(96px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:16px;}
  .wordmark{font-size:18px;font-weight:900;} .wordmark span{color:var(--green);}
  .hero{padding:24px;border:1px solid var(--line);border-radius:28px;background:linear-gradient(145deg,rgba(18,26,34,.96),rgba(11,16,21,.96));}
  .eyebrow{color:var(--green);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;}
  h1{margin:12px 0 6px;font-size:34px;line-height:1.05;} .order{margin:0;color:var(--sub);font-size:14px;font-weight:800;}
  .panel{padding:20px;border:1px solid var(--line);border-radius:24px;background:rgba(18,26,34,.94);}
  .notice{padding:13px 14px;border-radius:16px;background:rgba(254,243,199,.12);color:var(--warn);font-size:13px;font-weight:800;line-height:1.45;}
  .rows{margin:16px 0;} .rowline{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;font-weight:800;} .rowline .k{color:var(--muted);} .rowline:last-child{border-bottom:0;}
  .button{width:100%;height:58px;border:0;border-radius:18px;background:var(--green);color:#fff;font-size:16px;font-weight:900;box-shadow:0 16px 36px rgba(22,199,132,.22);margin-top:8px;}
  .button:disabled{opacity:.55;box-shadow:none;}
  .terms{margin:14px 2px 0;color:var(--muted);font-size:11px;line-height:1.5;font-weight:700;text-align:center;}
  .message{min-height:20px;margin:14px 0 0;color:var(--sub);font-size:12px;font-weight:800;text-align:center;white-space:pre-wrap;}
</style></head><body><main>
  <div class="wordmark">P<span>!</span>NUT</div>
  <section class="hero"><div class="eyebrow">Premium Subscription</div><h1>월 ${AMOUNT.toLocaleString('ko-KR')}원</h1><p class="order">${htmlEscape(args.clubName)} 프리미엄 구독</p></section>
  <section class="panel">
    <div class="notice">테스트 환경입니다. 실제로 결제되지 않아요. 카드를 등록하면 매월 자동 결제됩니다.</div>
    <div class="rows">
      <div class="rowline"><span class="k">구독료</span><span>월 ${AMOUNT.toLocaleString('ko-KR')}원</span></div>
      <div class="rowline"><span class="k">결제 방식</span><span>카드 자동결제</span></div>
      <div class="rowline"><span class="k">해지</span><span>언제든 가능</span></div>
    </div>
    <button id="btn" class="button" type="button">카드 등록하고 구독</button>
    <p class="terms">카드 등록 시 토스페이먼츠 자동결제 약관 및 개인정보 처리에 동의한 것으로 처리됩니다.</p>
    <p id="msg" class="message">카드 등록 창으로 이동합니다.</p>
  </section></main>
<script>
  var info = ${info};
  var btn = document.getElementById('btn'); var msg = document.getElementById('msg');
  async function run(){
    btn.disabled = true; msg.textContent = '카드 등록 창을 여는 중입니다.';
    try{
      var tp = TossPayments(info.clientKey);
      var payment = tp.payment({ customerKey: info.customerKey });
      await payment.requestBillingAuth({ method:'CARD', successUrl: info.successUrl, failUrl: info.failUrl, customerEmail: info.customerEmail, customerName: info.customerName });
    }catch(e){ btn.disabled = false; msg.textContent = (e && e.message) ? e.message : '카드 등록 창을 열지 못했어요.'; }
  }
  btn.addEventListener('click', run);
</script></body></html>`;
}

export default function SubscribeRoute() {
  const { profile, session } = useAuth();
  const params = useLocalSearchParams<{ clubId?: string; clubName?: string }>();
  const router = useRouter();
  const clubId = String(params.clubId ?? '');
  const clubName = String(params.clubName ?? '프리미엄 클럽');
  const customerKey = session?.user.id ?? '';
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const [status, setStatus] = useState('카드 등록 창을 준비하고 있어요.');
  const [finished, setFinished] = useState(false);

  const valid = isTossConfigured && !!clubId && !!customerKey;
  const html = useMemo(
    () => billingHtml({ clientKey: tossClientKey, customerKey, clubName, customerName: profile?.nickname ?? undefined, customerEmail: session?.user.email ?? undefined }),
    [customerKey, clubName, profile?.nickname, session?.user.email],
  );

  const onSuccess = useCallback(
    async (url: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const q = getQuery(unwrap(url));
      const authKey = q.get('authKey') ?? '';
      const custKey = q.get('customerKey') ?? customerKey;
      setStatus('구독을 확정하고 있어요.');
      try {
        const res = await startClubSubscription({ clubId, authKey, customerKey: custKey });
        if (!res.ok) {
          busyRef.current = false;
          setStatus(res.error ?? '구독 확정에 실패했어요.');
          Alert.alert('구독 실패', res.error ?? '잠시 후 다시 시도해주세요.');
          return;
        }
        doneRef.current = true;
        setFinished(true);
        setStatus('구독이 시작됐어요.');
        Alert.alert(
          '구독 완료',
          res.chargedNow ? `월 ${AMOUNT.toLocaleString('ko-KR')}원 구독이 시작됐어요.` : '카드가 등록됐어요. 무료체험이 끝나면 자동으로 결제돼요.',
          [{ text: '확인', onPress: () => router.back() }],
        );
      } catch (e) {
        busyRef.current = false;
        const m = e instanceof Error ? e.message : '구독 확정에 실패했어요.';
        setStatus(m);
        Alert.alert('구독 실패', m);
      }
    },
    [clubId, customerKey, router],
  );

  const onFail = useCallback(
    (url: string) => {
      if (busyRef.current) return;
      const q = getQuery(unwrap(url));
      const m = q.get('message') ? decodeURIComponent(q.get('message') ?? '') : '카드 등록이 취소되었어요.';
      setStatus(m);
      Alert.alert('카드 등록 실패', m, [{ text: '확인', onPress: () => router.back() }]);
    },
    [router],
  );

  const handleUrl = useCallback(
    (url: string) => {
      if (doneRef.current) return true;
      const u = unwrap(url);
      if (u.startsWith(SUCCESS_URL) || hasBillingSuccess(u)) {
        void onSuccess(u);
        return true;
      }
      if (u.startsWith(FAIL_URL) || hasFailure(u)) {
        void onFail(u);
        return true;
      }
      return false;
    },
    [onSuccess, onFail],
  );

  const shouldStart = useCallback(
    (req: { url?: string }) => {
      const url = req.url;
      if (!url || url === 'undefined' || doneRef.current) return false;
      if (handleUrl(url)) return false;
      const lower = url.toLowerCase();
      const web = ['http://', 'https://', 'about:', 'data:', 'blob:', 'javascript:'].some((p) => lower.startsWith(p));
      if (web) return true;
      void openExternal(url);
      return false;
    },
    [handleUrl],
  );

  const leave = useCallback(() => {
    if (doneRef.current) return router.back();
    router.back();
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={{ title: '구독', headerStyle: { backgroundColor: AppColors.background }, headerTintColor: AppColors.textPrimary, headerShadowVisible: false }} />
        <View style={styles.center}>
          <Text style={styles.errTitle}>구독을 시작할 수 없어요.</Text>
          <Text style={styles.errText}>결제 설정 또는 클럽 정보가 올바르지 않습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: '프리미엄 구독', headerStyle: { backgroundColor: AppColors.background }, headerTintColor: AppColors.textPrimary, headerShadowVisible: false }} />
      <View style={styles.wrap}>
        {finished ? (
          <View style={styles.finished}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.finishedTitle}>구독이 시작됐어요.</Text>
          </View>
        ) : (
          <WebView
            source={{ html, baseUrl: 'https://pinut.org' }}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            javaScriptCanOpenWindowsAutomatically
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            mixedContentMode="always"
            setSupportMultipleWindows
            onShouldStartLoadWithRequest={shouldStart}
            onOpenWindow={(e) => {
              const t = e.nativeEvent.targetUrl;
              if (!t || t === 'undefined') return;
              if (handleUrl(t)) return;
              void openExternal(t);
            }}
            onLoadEnd={() => {
              if (!doneRef.current) setStatus('카드 등록 창이 준비되었습니다.');
            }}
          />
        )}
        <View pointerEvents="none" style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  errTitle: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800' },
  errText: { color: AppColors.textSecondary, fontSize: 14, marginTop: Spacing.two, textAlign: 'center' },
  wrap: { flex: 1, backgroundColor: AppColors.background },
  finished: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  finishedTitle: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800' },
  statusBar: {
    position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, minHeight: 44,
    paddingHorizontal: Spacing.three, borderRadius: 16, backgroundColor: 'rgba(7,10,13,0.86)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
  },
  statusText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
