import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CLUB_PLUS_ENABLED, CLUB_SUBSCRIPTION_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { effectiveClubPlan, fetchClubPlans, isTrialActive, PLAN_FEATURES, PLAN_NAME, trialDaysLeft, won } from '@/lib/club-plan';
import { AppAlert as Alert } from '@/lib/feedback';
import { cancelClubSubscription, changeClubPlan } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import type { ClubPaidPlan, ClubPlanRow, ClubSubscription, ClubWithCounts } from '@/lib/types';

// 새로 고를 수 있는 플랜인가 — 서버에서 판매 중이고, 플러스는 앱 스위치까지 켜져 있어야 한다
const offered = (p: ClubPlanRow) => p.active && (p.plan !== 'premium_plus' || CLUB_PLUS_ENABLED);

const fmtYmd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

// 조사 '(으)로' — 받침 없거나 ㄹ 받침이면 '로'
function withRo(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}(으)로`;
  const jong = code % 28;
  return `${word}${jong === 0 || jong === 8 ? '로' : '으로'}`;
}

const TRIAL_ERRORS: Record<string, string> = {
  already_used: '이미 무료 체험을 사용한 클럽이에요.',
  forbidden: '클럽장만 체험을 시작할 수 있어요.',
  not_found: '클럽을 찾을 수 없어요.',
  plan_unavailable: '지금은 선택할 수 없는 플랜이에요.',
  no_trial: '이 플랜은 무료 체험이 없어요.',
};

// 클럽 플랜 관리 — 플랜 비교·무료 체험·구독·업그레이드(남은 기간 차액)·다운그레이드(다음 결제일부터)·해지. 클럽장 전용.
// 가격·결제 판단은 모두 서버(club_plans, toss-billing-*)가 한다. 이 화면은 결과만 보여준다.
export default function ClubPlanScreen() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [club, setClub] = useState<ClubWithCounts | null>(null);
  const [sub, setSub] = useState<ClubSubscription | null>(null);
  const [plans, setPlans] = useState<ClubPlanRow[]>([]);
  // 업그레이드 차액 미리보기. 값이 없으면 "아직 모름"(0원이 아니다).
  const [upgradeDiff, setUpgradeDiff] = useState<Partial<Record<ClubPaidPlan, number>>>({});
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  // 화면을 띄워 둔 사이 체험·결제 기간이 끝날 수 있으므로 데이터를 다시 읽을 때 시각도 함께 갱신한다
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!clubId || !uid) return;
    const [clubRes, subRes, planRows] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').eq('id', clubId).maybeSingle(),
      supabase
        .from('club_subscriptions')
        .select('id, club_id, owner_id, card_company, card_number_masked, plan, pending_plan, amount, status, current_period_start, current_period_end, next_charge_at, last_charge_at, fail_count, canceled_at, created_at, updated_at')
        .eq('club_id', clubId)
        .maybeSingle(),
      fetchClubPlans(),
    ]);
    // 조회 실패를 "구독 없음·권한 없음"으로 보여주지 않는다
    if (clubRes.error || subRes.error || planRows.length === 0) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    const nextClub = (clubRes.data as ClubWithCounts | null) ?? null;
    if (!nextClub || nextClub.owner_id !== uid) {
      Alert.alert('접근할 수 없어요', '클럽장만 플랜을 관리할 수 있어요.', [{ text: '확인', onPress: () => router.back() }]);
      return;
    }
    const nextSub = (subRes.data as ClubSubscription | null) ?? null;
    // 결제 중인 구독이면 더 비싼 플랜의 '오늘 결제할 차액'을 서버에서 미리 계산해 온다(실패하면 비워 둔다)
    const diffs: Partial<Record<ClubPaidPlan, number>> = {};
    if (nextSub?.status === 'active' && nextSub.last_charge_at) {
      for (const p of planRows) {
        if (!offered(p) || p.monthly_price <= nextSub.amount) continue;
        const res = await changeClubPlan({ clubId, plan: p.plan, preview: true });
        if (res.ok && res.action === 'upgraded') diffs[p.plan] = res.chargeAmount;
      }
    }
    setNowMs(Date.now());
    setClub(nextClub);
    setSub(nextSub);
    setPlans(planRows);
    setUpgradeDiff(diffs);
    setLoadFailed(false);
    setLoading(false);
  }, [clubId, uid, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 앱으로 돌아왔을 때도 새로 읽는다 — 띄워 둔 사이 결제일이 지나면 버튼이 안내하는 금액이 달라진다
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });
    return () => listener.remove();
  }, [load]);

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>플랜 정보를 불러오지 못했어요</Text>
          <Text style={styles.sub}>네트워크 상태를 확인하고 다시 시도해주세요.</Text>
          <Button
            title="다시 시도"
            variant="outline"
            onPress={() => {
              setLoadFailed(false);
              setLoading(true);
              load();
            }}
            style={styles.retryButton}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (loading || !club) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" />
        </View>
      </SafeAreaView>
    );
  }

  const plan = effectiveClubPlan(club, nowMs);
  const trialing = isTrialActive(club, nowMs);
  const daysLeft = trialDaysLeft(club, nowMs);
  const neverTrialed = club.premium_status === 'none';
  const subActive = sub?.status === 'active';
  const paid = !!sub && subActive && !!sub.last_charge_at; // 결제가 진행 중인 구독
  const freeSwitch = trialing || (subActive && !sub?.last_charge_at); // 과금 없이 플랜을 바꿀 수 있는 구간
  const periodLeft = !!sub?.current_period_end && new Date(sub.current_period_end).getTime() > nowMs; // 이용 기간이 남음
  const canceled = sub?.status === 'canceled';
  // 결제 실패 두 단계: 재시도 예정(다음 시도일이 있음) / 중지(재시도 끝)
  const retrying = sub?.status === 'past_due' && !!sub.next_charge_at;
  const suspended = club.premium_status === 'past_due' || (sub?.status === 'past_due' && !sub.next_charge_at);
  const busy = acting !== null;
  // 다시 구독·카드 재등록·카드 변경에 쓸 플랜 — 다음 결제부터 적용될 플랜(다운그레이드 예약이 있으면 그 플랜, 예약이 유지된다)
  const resubRow = plans.find((p) => p.plan === (sub?.pending_plan ?? sub?.plan ?? club.premium_plan));

  function goSubscribe(p: ClubPlanRow) {
    router.push({
      pathname: '/payment/subscribe',
      params: { clubId: club!.id, clubName: club!.name, plan: p.plan, planName: p.name, amount: String(p.monthly_price) },
    });
  }

  async function startTrial(p: ClubPlanRow) {
    setActing(`trial:${p.plan}`);
    const { data: result, error } = await supabase.rpc('start_club_trial', { p_club_id: club!.id, p_plan: p.plan });
    setActing(null);
    if (error || result !== 'ok') {
      Alert.alert('체험 시작 실패', (result && TRIAL_ERRORS[result]) ?? '잠시 후 다시 시도해주세요.');
      load();
      return;
    }
    Alert.alert('무료 체험 시작', `${p.name} 기능을 ${p.trial_months}개월 동안 사용할 수 있어요.`);
    load();
  }

  // expectedAmount = 사용자가 확인한 결제 금액. 서버는 이보다 많이 결제하지 않는다.
  // 결제가 없다고 안내한 버튼(무료 전환·변경 예약·예약 취소)은 0 을 보낸다 — 화면이 낡아 차액 결제가 필요해졌으면 서버가 거부한다.
  async function change(p: ClubPlanRow, expectedAmount?: number) {
    setActing(`change:${p.plan}`);
    const res = await changeClubPlan({ clubId: club!.id, plan: p.plan, expectedAmount });
    setActing(null);
    if (!res.ok) {
      if (res.retryable) {
        // 결과를 모르는 상태 — 같은 결제 건으로 다시 확인하므로 이중으로 결제되지 않는다
        Alert.alert('결제 확인 중', `${res.error}\n다시 시도해도 같은 결제로 확인하기 때문에 이중으로 결제되지 않아요.`, [
          { text: '닫기', style: 'cancel', onPress: () => load() },
          { text: '다시 시도', onPress: () => change(p, expectedAmount) },
        ]);
        return;
      }
      Alert.alert(res.code === 'amount_changed' ? '금액이 바뀌었어요' : '플랜 변경 실패', res.error);
      load();
      return;
    }
    if (res.action === 'needs_subscription') {
      goSubscribe(p);
      return;
    }
    if (res.action === 'noop') {
      Alert.alert('변경 없음', '이미 이 플랜을 쓰고 있어요.');
    } else if (res.action === 'switched') {
      Alert.alert('플랜 변경 완료', `${withRo(p.name)} 전환했어요.`);
    } else if (res.action === 'upgraded') {
      Alert.alert(
        '업그레이드 완료',
        res.chargeAmount > 0
          ? `${won(res.chargeAmount)}이 결제됐어요. 다음 결제일부터 월 ${won(res.monthlyPrice)}이 자동 결제돼요.`
          : `추가 결제 없이 ${withRo(p.name)} 바뀌었어요. 다음 결제일부터 월 ${won(res.monthlyPrice)}이 자동 결제돼요.`,
      );
    } else if (res.action === 'downgrade_scheduled') {
      Alert.alert('변경 예약 완료', `${res.effectiveAt ? fmtYmd(res.effectiveAt) : '다음 결제일'}부터 ${withRo(p.name)} 바뀌어요. 그때까지는 지금 플랜을 그대로 써요.`);
    } else if (res.action === 'pending_cleared') {
      Alert.alert('변경 취소 완료', '예약된 플랜 변경을 취소했어요.');
    }
    load();
  }

  // 결제 금액은 누르는 순간 서버에서 다시 계산해 보여준다(화면에 있던 값이 낡았거나 못 불러왔을 수 있다).
  async function confirmUpgrade(p: ClubPlanRow) {
    setActing(`change:${p.plan}`);
    const pre = await changeClubPlan({ clubId: club!.id, plan: p.plan, preview: true });
    setActing(null);
    if (!pre.ok) {
      Alert.alert('금액 확인 실패', pre.error);
      return;
    }
    if (pre.action !== 'upgraded') {
      // 그 사이 구독 상태가 바뀜(갱신·해지 등) — 금액을 안내할 수 없으니 화면부터 새로 고친다
      Alert.alert('다시 확인해주세요', '구독 상태가 바뀌었어요. 화면을 새로 불러올게요.');
      load();
      return;
    }
    const diff = pre.chargeAmount;
    setUpgradeDiff((prev) => ({ ...prev, [p.plan]: diff }));
    Alert.alert(
      `${p.name} 업그레이드`,
      diff > 0
        ? `남은 기간만큼의 차액 ${won(diff)}이 지금 결제돼요.\n다음 결제일부터는 월 ${won(p.monthly_price)}이 자동 결제돼요.`
        : `남은 기간이 짧아 추가 결제 없이 바로 바뀌어요.\n다음 결제일부터는 월 ${won(p.monthly_price)}이 자동 결제돼요.`,
      [
        { text: '닫기', style: 'cancel' },
        { text: '업그레이드', onPress: () => change(p, diff) },
      ],
    );
  }

  function confirmDowngrade(p: ClubPlanRow) {
    const lostDues = plan === 'premium_plus' && p.plan !== 'premium_plus';
    Alert.alert(
      `${withRo(p.name)} 변경`,
      `${sub?.current_period_end ? fmtYmd(sub.current_period_end) : '다음 결제일'}부터 ${withRo(p.name)} 바뀌고 월 ${won(p.monthly_price)}이 결제돼요.${lostDues ? '\n그날부터 회비 자동결제가 중지돼요.' : ''}`,
      [
        { text: '닫기', style: 'cancel' },
        { text: '변경 예약', onPress: () => change(p, 0) },
      ],
    );
  }

  async function cancelSub() {
    setActing('cancel');
    const res = await cancelClubSubscription(club!.id);
    setActing(null);
    if (!res.ok) {
      Alert.alert('해지 실패', res.error);
      return;
    }
    const until = res.activeUntil && new Date(res.activeUntil).getTime() > Date.now() ? res.activeUntil : null;
    Alert.alert('구독 해지', until ? `${fmtYmd(until)}까지 이용할 수 있어요. 이후 자동 결제가 멈춰요.` : '자동 결제를 멈췄어요.');
    load();
  }

  function confirmCancelSub() {
    Alert.alert(
      '구독 해지',
      periodLeft && sub?.current_period_end
        ? `해지해도 ${fmtYmd(sub.current_period_end)}까지 이용할 수 있어요. 이후 자동 결제가 멈춰요.`
        : '자동 결제를 멈출까요? 이용 기간이 끝난 상태라 유료 기능은 바로 중지돼요.',
      [
        { text: '닫기', style: 'cancel' },
        { text: '구독 해지', style: 'destructive', onPress: cancelSub },
      ],
    );
  }

  const currentRow = plans.find((p) => p.plan === plan);
  // 새로 고를 수 있는 플랜 + 지금 쓰고 있는 플랜만 보여준다(판매 중지·숨김 플랜은 쓰고 있는 클럽에만 보인다)
  const visiblePlans = plans.filter((p) => offered(p) || p.plan === plan || p.plan === sub?.plan);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>현재 플랜</Text>
              <Text style={styles.title}>{plan === 'free' ? '무료 플랜' : PLAN_NAME[plan]}</Text>
            </View>
            <Badge
              label={plan === 'free' ? 'Free' : daysLeft ? `체험 ${daysLeft}일` : '사용 중'}
              color={plan === 'free' ? '#AAB4C0' : '#16C784'}
              bg={plan === 'free' ? 'rgba(255,255,255,0.07)' : 'rgba(22,199,132,0.14)'}
            />
          </View>

          {trialing && club.premium_trial_ends_at ? (
            <Text style={styles.sub}>무료 체험 {fmtYmd(club.premium_trial_ends_at)} 종료</Text>
          ) : null}
          {sub && subActive ? (
            <>
              <Text style={styles.line}>
                {sub.card_company ? `${sub.card_company} ` : ''}
                {sub.card_number_masked || '카드'} · 월 {won(sub.amount)}
              </Text>
              <Text style={styles.sub}>
                {paid ? '다음 결제' : '첫 결제'} {sub.next_charge_at ? fmtYmd(sub.next_charge_at) : '-'}
              </Text>
              {/* 이용 기간이 남았을 때만: 카드만 바뀌고 결제되지 않는다(기간이 끝난 뒤의 카드 등록은 그 자리에서 결제된다) */}
              {CLUB_SUBSCRIPTION_ENABLED && resubRow && periodLeft ? (
                <Button title="결제 카드 변경" variant="outline" onPress={() => goSubscribe(resubRow)} disabled={busy} />
              ) : null}
            </>
          ) : null}
          {sub && canceled ? (
            <>
              <Text style={styles.sub}>
                {periodLeft && sub.current_period_end
                  ? `자동결제를 해지했어요. ${fmtYmd(sub.current_period_end)}까지 이용할 수 있어요.`
                  : '자동결제를 해지했어요.'}
              </Text>
              {CLUB_SUBSCRIPTION_ENABLED && resubRow ? (
                <>
                  <Text style={styles.sub}>
                    {periodLeft && sub.current_period_end
                      ? `다시 구독하면 지금은 결제되지 않고, ${fmtYmd(sub.current_period_end)}부터 월 ${won(resubRow.monthly_price)}이 자동 결제돼요.`
                      : `다시 구독하면 월 ${won(resubRow.monthly_price)}이 바로 결제돼요.`}
                  </Text>
                  <Button title="다시 구독하기" onPress={() => goSubscribe(resubRow)} disabled={busy} />
                </>
              ) : null}
            </>
          ) : null}
          {sub && !canceled && (retrying || suspended) ? (
            <>
              <Text style={styles.warn}>
                {suspended
                  ? '결제가 계속 실패해 유료 기능이 중지됐어요.'
                  : `결제에 실패했어요. ${fmtYmd(sub.next_charge_at!)}에 같은 카드로 다시 시도해요.`}
              </Text>
              {CLUB_SUBSCRIPTION_ENABLED && resubRow ? (
                <>
                  <Text style={styles.sub}>카드를 다시 등록하면 월 {won(resubRow.monthly_price)}이 바로 결제되고 계속 쓸 수 있어요.</Text>
                  <Button title="카드 다시 등록" onPress={() => goSubscribe(resubRow)} disabled={busy} />
                </>
              ) : null}
            </>
          ) : null}
          {plan === 'free' && neverTrialed ? <Text style={styles.sub}>무료 체험으로 먼저 써볼 수 있어요.</Text> : null}
          {trialing && !sub && currentRow && CLUB_SUBSCRIPTION_ENABLED ? (
            <>
              <Text style={styles.sub}>체험이 끝난 뒤에도 계속 쓰려면 카드를 등록하세요. 체험 중에는 결제되지 않아요.</Text>
              <Button title={`카드 등록 (체험 후 월 ${won(currentRow.monthly_price)})`} onPress={() => goSubscribe(currentRow)} disabled={busy} />
            </>
          ) : null}
          {sub && subActive && sub.pending_plan ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingText}>
                {sub.current_period_end ? fmtYmd(sub.current_period_end) : '다음 결제일'}부터 {withRo(PLAN_NAME[sub.pending_plan])} 바뀌어요.
              </Text>
              <Button
                title="변경 취소"
                variant="outline"
                loading={acting === `change:${sub.plan}`}
                disabled={busy}
                onPress={() => {
                  const row = plans.find((p) => p.plan === sub.plan);
                  if (row) change(row, 0);
                }}
              />
            </View>
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>플랜 선택</Text>
        {visiblePlans.map((p) => {
          const isCurrent = plan === p.plan;
          const diff = upgradeDiff[p.plan];
          return (
            <View key={p.plan} style={[styles.card, isCurrent && styles.cardCurrent]}>
              <View style={styles.rowBetween}>
                <Text style={styles.planName}>{p.name}</Text>
                <Text style={styles.planPrice}>월 {won(p.monthly_price)}</Text>
              </View>
              <View style={styles.features}>
                {PLAN_FEATURES[p.plan].map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Ionicons name="checkmark" size={15} color="#16C784" />
                    <Text style={styles.featureText}>{f}</Text>
                  </View>
                ))}
              </View>

              {isCurrent ? (
                <Text style={styles.currentText}>지금 사용 중인 플랜이에요.</Text>
              ) : neverTrialed ? (
                <Button
                  title={`${p.trial_months}개월 무료 체험 시작`}
                  onPress={() => startTrial(p)}
                  loading={acting === `trial:${p.plan}`}
                  disabled={busy}
                />
              ) : !CLUB_SUBSCRIPTION_ENABLED ? (
                <Text style={styles.sub}>구독 결제는 곧 지원될 예정이에요.</Text>
              ) : freeSwitch ? (
                <Button
                  title={`${withRo(p.name)} 전환 (지금은 무료)`}
                  variant="outline"
                  onPress={() => change(p, 0)}
                  loading={acting === `change:${p.plan}`}
                  disabled={busy}
                />
              ) : paid && sub ? (
                p.monthly_price > sub.amount ? (
                  <>
                    <Text style={styles.sub}>
                      {diff === undefined
                        ? '오늘 결제할 차액은 업그레이드를 누르면 확인할 수 있어요.'
                        : diff > 0
                          ? `오늘 결제할 차액 ${won(diff)} (남은 기간만 계산)`
                          : '남은 기간이 짧아 추가 결제 없이 바로 바뀌어요.'}
                    </Text>
                    <Button
                      title={`${withRo(p.name)} 업그레이드`}
                      onPress={() => confirmUpgrade(p)}
                      loading={acting === `change:${p.plan}`}
                      disabled={busy}
                    />
                  </>
                ) : sub.pending_plan === p.plan ? (
                  <Text style={styles.currentText}>다음 결제일부터 이 플랜으로 바뀌어요.</Text>
                ) : (
                  <Button
                    title="다음 결제일부터 변경"
                    variant="outline"
                    onPress={() => confirmDowngrade(p)}
                    loading={acting === `change:${p.plan}`}
                    disabled={busy}
                  />
                )
              ) : (
                <Button title={`구독하기 (월 ${won(p.monthly_price)})`} onPress={() => goSubscribe(p)} disabled={busy} />
              )}
            </View>
          );
        })}

        {/* 재시도 예정인 구독도 해지할 수 있어야 한다(더 결제되지 않게) */}
        {sub && (subActive || retrying) ? (
          <Button title="구독 해지" variant="outline" onPress={confirmCancelSub} loading={acting === 'cancel'} disabled={busy} style={styles.cancelButton} />
        ) : null}
        <Text style={styles.footnote}>결제는 토스페이먼츠 카드 자동결제로 진행되고, 언제든 해지할 수 있어요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  retryButton: { marginTop: Spacing.two, alignSelf: 'stretch' },
  flex: { flex: 1 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 10,
  },
  cardCurrent: { borderColor: '#16C784', backgroundColor: 'rgba(22,199,132,0.08)' },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { color: '#16C784', fontSize: 12, fontWeight: '900' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 4 },
  line: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  sub: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warn: { color: '#F5A623', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  pendingBox: {
    gap: 10,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(245,166,35,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.24)',
    padding: 12,
  },
  pendingText: { color: '#F5A623', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  sectionTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900', marginTop: Spacing.two },
  planName: { color: '#F8FAFC', fontSize: 17, fontWeight: '900' },
  planPrice: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  features: { gap: 7 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  featureText: { flex: 1, color: '#AAB4C0', fontSize: 13, lineHeight: 18, fontWeight: '600' },
  currentText: { color: '#16C784', fontSize: 13, fontWeight: '800' },
  cancelButton: { marginTop: Spacing.two },
  footnote: { color: '#707B87', fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
});
