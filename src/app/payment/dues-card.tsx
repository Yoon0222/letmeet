import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { billingAuthHtml, TossBillingWebView } from '@/components/toss-billing-webview';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { won } from '@/lib/club-plan';
import { buildConsentText, consentAmount, CYCLE_LABEL, CYCLE_NAME, enrollDues, fetchDuesPlan, replaceDuesCard } from '@/lib/dues';
import { AppAlert as Alert } from '@/lib/feedback';
import { isTossConfigured, tossClientKey } from '@/lib/payments';
import type { ClubDuesPlan, DuesCycle } from '@/lib/types';
import { AppColors } from '@/theme';

// 회비 결제 카드 등록.
//   mode=enroll  : 자동결제 동의(직전 화면에서 확인한 금액·주기) + 카드 등록. 규칙이 그 사이 바뀌었으면 돌아가서 다시 동의받는다.
//   mode=replace : 등록해 둔 카드를 새 카드로 교체.
// 카드 등록(authKey) 뒤의 서버 호출이 실패해 결과를 모르면, 같은 authKey 로 다시 확인한다(새로 등록하지 않는다).
export default function DuesCardRoute() {
  const { profile, session } = useAuth();
  const params = useLocalSearchParams<{ clubId?: string; clubName?: string; mode?: string; amount?: string; cycle?: string }>();
  const router = useRouter();
  const clubId = String(params.clubId ?? '');
  const clubName = String(params.clubName ?? '클럽');
  const mode = params.mode === 'replace' ? 'replace' : 'enroll';
  const agreedAmount = Number(params.amount) || 0;
  const agreedCycle = (params.cycle ?? '') as DuesCycle | '';
  const customerKey = session?.user.id ?? '';

  const busyRef = useRef(false);
  const doneRef = useRef(false);
  const [plan, setPlan] = useState<ClubDuesPlan | null>(null);
  const [ready, setReady] = useState(mode === 'replace');
  const [status, setStatus] = useState<string | null>('카드 등록 창을 준비하고 있어요.');
  const [confirming, setConfirming] = useState(false);
  const [finished, setFinished] = useState(false);
  const [retry, setRetry] = useState<{ authKey: string; custKey: string; message: string } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // 등록 모드: 지금 규칙이 직전 화면에서 동의한 내용과 같은지 확인한다
  useEffect(() => {
    if (mode !== 'enroll' || !clubId) return;
    let alive = true;
    fetchDuesPlan(clubId).then((p) => {
      if (!alive) return;
      if (!p || !p.active || p.cycle !== agreedCycle || consentAmount(p) !== agreedAmount) {
        Alert.alert('회비 내용이 바뀌었어요', '다시 확인하고 동의해주세요.', [{ text: '확인', onPress: () => router.back() }]);
        return;
      }
      setPlan(p);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [mode, clubId, agreedAmount, agreedCycle, router]);

  const valid = isTossConfigured && !!customerKey && (mode === 'replace' || !!clubId);

  const html = useMemo(
    () =>
      mode === 'enroll' && plan
        ? billingAuthHtml({
            clientKey: tossClientKey,
            customerKey,
            eyebrow: 'Club Dues',
            heading: `${CYCLE_LABEL[plan.cycle]} ${won(agreedAmount)}`,
            sub: `${clubName} 회비 자동결제`,
            notice: '카드를 등록하면 납부일마다 회비가 자동으로 결제됩니다.',
            rows: [
              ['회비', `${CYCLE_NAME[plan.cycle]} ${won(agreedAmount)}`],
              ['납부일', plan.cycle === 'monthly' ? `매월 ${plan.due_day}일` : plan.cycle === 'quarterly' ? `1·4·7·10월 ${plan.due_day}일` : `매년 ${plan.start_month}월 ${plan.due_day}일`],
              ['결제 방식', '카드 자동결제'],
              ['해지', '언제든 가능'],
            ],
            buttonLabel: '카드 등록하고 자동결제 시작',
            customerName: profile?.nickname ?? undefined,
            customerEmail: session?.user.email ?? undefined,
          })
        : billingAuthHtml({
            clientKey: tossClientKey,
            customerKey,
            eyebrow: 'Club Dues',
            heading: '결제 카드 변경',
            sub: '회비 자동결제에 쓰는 카드',
            notice: '새 카드를 등록하면 다음 결제부터 이 카드로 결제됩니다. 지금은 결제되지 않아요.',
            rows: [
              ['적용', '자동결제를 등록한 모든 클럽'],
              ['결제 방식', '카드 자동결제'],
            ],
            buttonLabel: '새 카드 등록',
            customerName: profile?.nickname ?? undefined,
            customerEmail: session?.user.email ?? undefined,
          }),
    [mode, plan, customerKey, clubName, agreedAmount, profile?.nickname, session?.user.email],
  );

  // 카드 등록(authKey) 이후의 서버 반영. 한 번 시작하면 끝날 때까지 busy 를 유지한다.
  const confirm = useCallback(
    async (authKey: string, custKey: string) => {
      setRetry(null);
      setConfirming(true);
      setStatus(mode === 'enroll' ? '자동결제를 등록하고 있어요.' : '카드를 바꾸고 있어요.');
      try {
        if (mode === 'replace') {
          const res = await replaceDuesCard({ authKey, customerKey: custKey });
          if (!res.ok) {
            setStatus(null);
            if (res.retryable) setRetry({ authKey, custKey, message: res.error });
            else setFailure(res.error);
            return;
          }
          doneRef.current = true;
          setFinished(true);
          setStatus(null);
          Alert.alert('카드 변경 완료', '다음 결제부터 새 카드로 결제돼요.', [{ text: '확인', onPress: () => router.back() }]);
          return;
        }
        if (!plan) return;
        const res = await enrollDues({
          clubId,
          consent: { amount: agreedAmount, cycle: plan.cycle, text: buildConsentText(clubName, plan) },
          authKey,
          customerKey: custKey,
        });
        if (!res.ok) {
          setStatus(null);
          if (res.retryable) setRetry({ authKey, custKey, message: res.error });
          else setFailure(res.error);
          return;
        }
        doneRef.current = true;
        setFinished(true);
        setStatus(null);
        const c = res.charge;
        const message =
          c.status === 'paid'
            ? `회비 ${won(c.amount ?? agreedAmount)}이 결제됐어요. 다음부터는 납부일에 자동으로 결제돼요.`
            : c.status === 'failed'
              ? `자동결제는 등록됐지만 이번 회비 결제는 실패했어요.${c.reason ? `\n${c.reason}` : ''}\n회비 화면에서 다시 결제할 수 있어요.`
              : c.status === 'unknown'
                ? '자동결제를 등록했어요. 이번 회비 결제는 결과를 확인하고 있어요 — 잠시 후 회비 화면에서 확인해주세요.'
                : '자동결제를 등록했어요. 납부일에 자동으로 결제돼요.';
        Alert.alert('자동결제 등록 완료', message, [{ text: '확인', onPress: () => router.back() }]);
      } catch {
        setStatus(null);
        setRetry({ authKey, custKey, message: '서버 응답을 받지 못했어요. 네트워크를 확인해주세요.' });
      } finally {
        setConfirming(false);
      }
    },
    [mode, plan, clubId, clubName, agreedAmount, router],
  );

  const onAuth = useCallback(
    (authKey: string, custKey: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      void confirm(authKey, custKey || customerKey);
    },
    [confirm, customerKey],
  );

  const onFail = useCallback(
    (message: string) => {
      if (busyRef.current) return;
      setStatus(message);
      Alert.alert('카드 등록 실패', message, [{ text: '확인', onPress: () => router.back() }]);
    },
    [router],
  );

  const confirmLeave = useCallback(() => {
    if (doneRef.current || failure) return router.back();
    if (retry) {
      Alert.alert('나가기', '등록 결과를 아직 확인하지 못했어요. 나가도 이중으로 결제되지는 않아요.\n등록됐는지는 회비 화면에서 확인할 수 있어요.', [
        { text: '계속 확인', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: () => router.back() },
      ]);
      return;
    }
    if (busyRef.current) {
      Alert.alert('잠시만요', '처리하는 중이에요. 잠시 후 완료돼요.');
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

  const title = mode === 'enroll' ? '회비 카드 등록' : '결제 카드 변경';
  const screenOptions = {
    title,
    headerStyle: { backgroundColor: AppColors.background },
    headerTintColor: AppColors.textPrimary,
    headerShadowVisible: false,
    gestureEnabled: !confirming && !retry,
  };

  if (!valid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.center}>
          <Text style={styles.title}>카드를 등록할 수 없어요.</Text>
          <Text style={styles.text}>결제 설정 또는 클럽 정보가 올바르지 않습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={screenOptions} />
      <View style={styles.wrap}>
        {finished ? (
          <View style={styles.center}>
            <ActivityIndicator color={AppColors.primary} />
            <Text style={styles.title}>{mode === 'enroll' ? '자동결제를 등록했어요.' : '카드를 바꿨어요.'}</Text>
          </View>
        ) : retry ? (
          <View style={styles.center}>
            <Text style={styles.title}>결과를 확인하지 못했어요</Text>
            <Text style={styles.text}>{retry.message}</Text>
            <Text style={styles.text}>다시 확인해도 같은 등록으로 확인하기 때문에 이중으로 결제되지 않아요.</Text>
            <Button title="다시 확인" onPress={() => void confirm(retry.authKey, retry.custKey)} style={styles.button} />
          </View>
        ) : failure ? (
          <View style={styles.center}>
            <Text style={styles.title}>{mode === 'enroll' ? '자동결제를 등록하지 못했어요' : '카드를 바꾸지 못했어요'}</Text>
            <Text style={styles.text}>{failure}</Text>
            <Button title="돌아가기" variant="outline" onPress={() => router.back()} style={styles.button} />
          </View>
        ) : confirming || !ready ? (
          <View style={styles.center}>
            <ActivityIndicator color={AppColors.primary} />
          </View>
        ) : (
          <TossBillingWebView
            html={html}
            onAuth={onAuth}
            onFail={onFail}
            onLoadEnd={() => {
              if (!doneRef.current && !busyRef.current) setStatus(null);
            }}
          />
        )}
        {finished ? null : (
          <Pressable onPress={confirmLeave} hitSlop={8} style={styles.closeBtn} accessibilityLabel="카드 등록 닫기">
            <Ionicons name="close" size={20} color={AppColors.textPrimary} />
          </Pressable>
        )}
        {status && ready ? (
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
  wrap: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  title: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  text: { color: AppColors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  button: { alignSelf: 'stretch', marginTop: Spacing.three },
  closeBtn: {
    position: 'absolute', top: Spacing.two, right: Spacing.three, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(7,10,13,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center', justifyContent: 'center',
  },
  statusBar: {
    position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.three, minHeight: 44,
    paddingHorizontal: Spacing.three, borderRadius: 16, backgroundColor: 'rgba(7,10,13,0.86)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two,
  },
  statusText: { color: AppColors.textSecondary, fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
