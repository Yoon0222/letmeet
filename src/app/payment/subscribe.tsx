import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { billingAuthHtml, TossBillingWebView } from '@/components/toss-billing-webview';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { AppAlert as Alert } from '@/lib/feedback';
import { isTossConfigured, startClubSubscription, tossClientKey } from '@/lib/payments';
import { AppColors } from '@/theme';

// 화면 표시용 기본값(구 진입점 호환). 실제 결제 금액은 서버(club_plans)가 정한다.
const DEFAULT_AMOUNT = 5500;
const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

export default function SubscribeRoute() {
  const { profile, session } = useAuth();
  const params = useLocalSearchParams<{ clubId?: string; clubName?: string; plan?: string; planName?: string; amount?: string }>();
  const router = useRouter();
  const clubId = String(params.clubId ?? '');
  const clubName = String(params.clubName ?? '프리미엄 클럽');
  const plan = params.plan === 'premium_plus' ? 'premium_plus' : 'premium';
  const planName = String(params.planName || '프리미엄');
  const amount = Number(params.amount) > 0 ? Number(params.amount) : DEFAULT_AMOUNT;
  const customerKey = session?.user.id ?? '';
  const busyRef = useRef(false);
  const doneRef = useRef(false);
  // status 는 보여줄 게 있을 때만 값이 있다(null 이면 하단 상태바 숨김) — 카드창 위에 계속 떠 있지 않도록.
  const [status, setStatus] = useState<string | null>('카드 등록 창을 준비하고 있어요.');
  const [confirming, setConfirming] = useState(false);
  const [finished, setFinished] = useState(false);
  // 결제 결과를 확인하지 못한 카드 등록 — 같은 authKey 로 다시 확인해야 한다(새로 등록하면 다른 주문이 된다)
  const [retry, setRetry] = useState<{ authKey: string; custKey: string; message: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const valid = isTossConfigured && !!clubId && !!customerKey;
  const html = useMemo(
    () =>
      billingAuthHtml({
        clientKey: tossClientKey,
        customerKey,
        eyebrow: 'Club Subscription',
        heading: `월 ${won(amount)}`,
        sub: `${clubName} ${planName} 구독`,
        notice: '카드를 등록하면 매월 자동 결제됩니다.',
        rows: [
          ['플랜', planName],
          ['구독료', `월 ${won(amount)}`],
          ['결제 방식', '카드 자동결제'],
          ['해지', '언제든 가능'],
        ],
        buttonLabel: '카드 등록하고 구독',
        customerName: profile?.nickname ?? undefined,
        customerEmail: session?.user.email ?? undefined,
      }),
    [customerKey, clubName, planName, amount, profile?.nickname, session?.user.email],
  );

  // 카드 등록(authKey) 이후의 구독 확정. 한 번 시작하면 끝(완료·실패 확정·나가기)날 때까지 busy 를 유지한다.
  const confirmSubscription = useCallback(
    async (authKey: string, custKey: string) => {
      setRetry(null);
      setConfirming(true);
      setStatus('구독을 확정하고 있어요.');
      try {
        const res = await startClubSubscription({ clubId, authKey, customerKey: custKey, plan });
        if (!res.ok) {
          setStatus(null);
          if (res.retryable) setRetry({ authKey, custKey, message: res.error });
          else setFailure(res.error); // 확정 실패(카드 거절 등) — 돌아가서 다시 등록
          return;
        }
        doneRef.current = true;
        setFinished(true);
        setStatus(null); // 완료 화면이 대신 안내
        // 금액은 서버 응답 기준(첫 결제·업그레이드 차액·무과금 재개를 구분)
        const monthly = res.monthlyPrice ?? amount;
        const doneMessage = res.pendingPlan
          ? `카드가 등록됐어요. 지금 플랜은 그대로 쓰고, 다음 결제일부터 ${planName} 월 ${won(amount)}으로 바뀌어요.`
          : res.chargedNow
            ? `${won(res.chargedAmount ?? monthly)}이 결제됐어요. 다음 결제일부터 월 ${won(monthly)}이 자동 결제돼요.`
            : res.trialing
              ? '카드가 등록됐어요. 무료체험이 끝나면 자동으로 결제돼요.'
              : '카드가 등록됐어요. 다음 결제일에 자동으로 결제돼요.';
        Alert.alert('구독 완료', doneMessage, [{ text: '확인', onPress: () => router.back() }]);
      } catch {
        // 응답을 못 받았을 뿐 서버에서는 처리됐을 수 있다 → 같은 카드 등록으로 다시 확인
        setStatus(null);
        setRetry({ authKey, custKey, message: '서버 응답을 받지 못했어요. 네트워크를 확인해주세요.' });
      } finally {
        setConfirming(false);
      }
    },
    [clubId, plan, planName, amount, router],
  );

  // 카드 등록 성공(공용 웹뷰가 한 번만 부른다)
  const onAuth = useCallback(
    (authKey: string, custKey: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      void confirmSubscription(authKey, custKey || customerKey);
    },
    [confirmSubscription, customerKey],
  );

  const onFail = useCallback(
    (message: string) => {
      if (busyRef.current) return;
      setStatus(message);
      Alert.alert('카드 등록 실패', message, [{ text: '확인', onPress: () => router.back() }]);
    },
    [router],
  );

  // 닫기(✕)·안드로이드 뒤로가기 공용 — 등록 도중엔 실수 방지용 확인을 거친다.
  //   빌링 인증은 authKey 를 받기 전까지 서버에 아무것도 만들지 않으므로 그냥 나가도 안전하다.
  const confirmLeave = useCallback(() => {
    if (doneRef.current || failure) return router.back();
    if (retry) {
      Alert.alert(
        '나가기',
        '결제 결과를 아직 확인하지 못했어요. 나가도 이중으로 결제되지는 않아요.\n구독이 시작됐는지는 플랜 관리에서 확인할 수 있고, 구독에 반영되지 않은 결제는 자동으로 환불돼요(보통 하루 안).',
        [
          { text: '계속 확인', style: 'cancel' },
          { text: '나가기', style: 'destructive', onPress: () => router.back() },
        ],
      );
      return;
    }
    if (busyRef.current) {
      Alert.alert('잠시만요', '구독을 확정하는 중이에요. 잠시 후 완료돼요.');
      return;
    }
    Alert.alert('카드 등록 취소', '카드 등록을 그만두고 나갈까요?', [
      { text: '계속 등록', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => router.back() },
    ]);
  }, [router, retry, failure]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave();
      return true;
    });
    return () => sub.remove();
  }, [confirmLeave]);

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
      {/* 구독 확정 중·결과 확인 중에는 iOS 뒤로 스와이프로 빠져나가지 않게 한다(안드로이드 뒤로가기는 BackHandler 가 막는다) */}
      <Stack.Screen options={{ title: `${planName} 구독`, headerStyle: { backgroundColor: AppColors.background }, headerTintColor: AppColors.textPrimary, headerShadowVisible: false, gestureEnabled: !confirming && !retry }} />
      <View style={styles.wrap}>
        {finished ? (
          <View style={styles.finished}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.finishedTitle}>구독이 시작됐어요.</Text>
          </View>
        ) : retry || failure || confirming ? (
          // 카드 등록은 끝났고 구독 확정만 남은 상태 — 카드창 대신 결과 화면을 보여준다
          <View style={styles.finished}>
            {retry ? (
              <>
                <Text style={styles.finishedTitle}>결제 결과를 확인하지 못했어요</Text>
                <Text style={styles.errText}>{retry.message}</Text>
                <Text style={styles.errText}>다시 확인해도 같은 결제로 확인하기 때문에 이중으로 결제되지 않아요.</Text>
                <Button title="다시 확인" onPress={() => void confirmSubscription(retry.authKey, retry.custKey)} style={styles.retryButton} />
              </>
            ) : failure ? (
              <>
                <Text style={styles.finishedTitle}>구독을 시작하지 못했어요</Text>
                <Text style={styles.errText}>{failure}</Text>
                <Button title="돌아가기" variant="outline" onPress={() => router.back()} style={styles.retryButton} />
              </>
            ) : (
              <ActivityIndicator color={AppColors.primary} />
            )}
          </View>
        ) : (
          <TossBillingWebView
            html={html}
            onAuth={onAuth}
            onFail={onFail}
            onLoadEnd={() => {
              // 카드창이 뜨면 안내는 치운다 — 확정 중(busy) 메시지는 유지.
              if (!doneRef.current && !busyRef.current) setStatus(null);
            }}
          />
        )}
        {/* 헤더가 없는 전체화면이라 나가는 길을 따로 만든다 */}
        {finished ? null : (
          <Pressable onPress={confirmLeave} hitSlop={8} style={styles.closeBtn} accessibilityLabel="카드 등록 닫기">
            <Ionicons name="close" size={20} color="#F8FAFC" />
          </Pressable>
        )}
        {status ? (
          <View pointerEvents="none" style={styles.statusBar}>
            {confirming ? <ActivityIndicator size="small" color={AppColors.primary} /> : null}
            <Text style={styles.statusText}>{status}</Text>
          </View>
        ) : null}
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
  closeBtn: {
    position: 'absolute', top: Spacing.two, right: Spacing.three, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(7,10,13,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  finished: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  finishedTitle: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  retryButton: { alignSelf: 'stretch', marginTop: Spacing.three },
  statusBar: {
    position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, minHeight: 44,
    paddingHorizontal: Spacing.three, borderRadius: 16, backgroundColor: 'rgba(7,10,13,0.86)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
  },
  statusText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
