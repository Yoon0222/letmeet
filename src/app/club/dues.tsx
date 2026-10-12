import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CLUB_DUES_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { won } from '@/lib/club-plan';
import {
  autopayCovers,
  checkDuesPayment,
  dayLabel,
  deleteDuesCard,
  DUES_STATUS_LABEL,
  failureTitle,
  fetchDuesPeriods,
  fetchDuesPlan,
  fetchDuesRoster,
  fetchDuesStatus,
  fetchMyCard,
  fetchMyDues,
  fetchMyMandate,
  markDues,
  payDuesNow,
  periodLabel,
  planSummary,
  refundDuesCharge,
  revokeDuesMandate,
  todayKst,
} from '@/lib/dues';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type {
  ClubDues,
  ClubDuesMandate,
  ClubDuesPeriodRow,
  ClubDuesPlan,
  ClubDuesRosterRow,
  ClubDuesStatus,
  DuesStatus,
  MemberBillingCard,
} from '@/lib/types';

const STATUS_COLOR: Record<DuesStatus, { color: string; bg: string }> = {
  open: { color: '#F5A623', bg: 'rgba(245,166,35,0.14)' },
  processing: { color: '#7CC4FF', bg: 'rgba(124,196,255,0.14)' },
  paid: { color: '#16C784', bg: 'rgba(22,199,132,0.14)' },
  failed: { color: '#FF6B6B', bg: 'rgba(255,107,107,0.14)' },
  exempt: { color: '#AAB4C0', bg: 'rgba(255,255,255,0.07)' },
  refunded: { color: '#AAB4C0', bg: 'rgba(255,255,255,0.07)' },
  void: { color: '#707B87', bg: 'rgba(255,255,255,0.05)' },
};
const PAST_PREVIEW = 6;
const unpaid = (d: ClubDues) => d.status === 'open' || d.status === 'failed';

type ClubLite = { id: string; name: string; owner_id: string };

// 클럽 회비 — 회원: 내 회비·자동결제·지금 결제 / 운영진(클럽장·임원): 기간별 납부 명단·현금 납부·면제·환불.
// 금액·상태 판단은 모두 서버가 한다. 이 화면은 조회하고 서버 함수를 부를 뿐이다.
// 회비가 꺼졌거나 플러스가 아니게 돼도, 남아 있는 동의·카드·기록·환불은 이 화면에서 계속 처리할 수 있다.
export default function ClubDuesScreen() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [club, setClub] = useState<ClubLite | null>(null);
  const [status, setStatus] = useState<ClubDuesStatus | null>(null);
  const [plan, setPlan] = useState<ClubDuesPlan | null>(null);
  const [myDues, setMyDues] = useState<ClubDues[]>([]);
  const [mandate, setMandate] = useState<ClubDuesMandate | null>(null);
  const [card, setCard] = useState<MemberBillingCard | null>(null);
  const [periods, setPeriods] = useState<ClubDuesPeriodRow[]>([]);
  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const [roster, setRoster] = useState<ClubDuesRosterRow[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // 마지막 처리 결과 — 토스트는 금방 사라지므로 화면에도 남긴다
  const [showAllPast, setShowAllPast] = useState(false);

  const periodRef = useRef<string | null>(null); // 운영진이 고른 기간(다시 읽어도 유지)
  const rosterKeyRef = useRef<string | null>(null); // 지금 화면에 떠 있는 명단의 기간
  const loadSeq = useRef(0);
  const rosterSeq = useRef(0);

  const load = useCallback(async () => {
    if (!clubId || !uid) return;
    const seq = ++loadSeq.current;
    const wanted = periodRef.current;
    try {
      const [clubRes, st, pl] = await Promise.all([
        supabase.from('clubs').select('id, name, owner_id').eq('id', clubId).maybeSingle(),
        fetchDuesStatus(clubId),
        fetchDuesPlan(clubId),
      ]);
      if (clubRes.error || !clubRes.data || !st) throw new Error('dues_load_failed');
      const [dues, man, cd] = await Promise.all([fetchMyDues(clubId, uid), fetchMyMandate(clubId, uid), fetchMyCard(uid)]);
      let nextPeriods: ClubDuesPeriodRow[] = [];
      let nextKey: string | null = null;
      let nextRoster: ClubDuesRosterRow[] = [];
      if (st.is_manager) {
        nextPeriods = await fetchDuesPeriods(clubId);
        nextKey = nextPeriods.find((p) => p.period_key === wanted)?.period_key ?? nextPeriods[0]?.period_key ?? null;
        if (nextKey) nextRoster = await fetchDuesRoster(clubId, nextKey);
      }
      if (seq !== loadSeq.current) return; // 더 나중에 시작한 조회가 있으면 이 결과는 버린다
      setToday(todayKst());
      setClub(clubRes.data as ClubLite);
      setStatus(st);
      setPlan(pl);
      setMyDues(dues);
      setMandate(man);
      setCard(cd);
      setPeriods(nextPeriods);
      // 읽는 사이 운영진이 다른 기간을 골랐으면 그 선택(과 그 명단)을 덮어쓰지 않는다
      if (periodRef.current === wanted) {
        periodRef.current = nextKey;
        rosterKeyRef.current = nextKey;
        setPeriodKey(nextKey);
        setRoster(nextRoster);
      }
      setLoadFailed(false);
      setLoading(false);
    } catch {
      if (seq !== loadSeq.current) return;
      setLoadFailed(true);
      setLoading(false);
    }
  }, [clubId, uid]);

  useFocusEffect(
    useCallback(() => {
      setNotice(null); // 다른 화면(카드 변경·동의)에 다녀오면 지난 처리 결과는 지운다 — 지금 상태는 아래 행이 보여준다
      load();
    }, [load]),
  );

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>회비 정보를 불러오지 못했어요</Text>
          <Text style={styles.sub}>네트워크 상태를 확인하고 다시 시도해주세요.</Text>
          <Button
            title="다시 시도"
            variant="outline"
            onPress={() => {
              setLoadFailed(false);
              setLoading(true);
              load();
            }}
            style={styles.wide}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (loading || !club || !status) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" />
        </View>
      </SafeAreaView>
    );
  }

  // 지금 이 클럽에서 회비를 새로 받을 수 있는 상태인가(서버 스위치 + 플러스)
  const available = status.enabled && status.plus;
  const unavailableTitle = status.enabled && !status.plus ? '프리미엄 플러스 클럽에서 쓸 수 있어요' : '회비 기능은 아직 준비 중이에요';
  const liveMandate = !!mandate && mandate.status !== 'revoked';
  const isMember = status.is_member ?? true; // 값이 없는(옛 함수) 서버에서는 막지 않는다 — 등록할 때 서버가 다시 확인한다
  const hasMine = liveMandate || !!card || myDues.length > 0;
  const showRoster = status.is_manager && (available || periods.length > 0);

  if (!CLUB_DUES_ENABLED || (!available && !hasMine && !showRoster)) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>{unavailableTitle}</Text>
          {CLUB_DUES_ENABLED && status.is_owner && status.enabled && !status.plus ? (
            <Button title="플랜 관리" onPress={() => router.push({ pathname: '/club/plan', params: { clubId: club.id } })} style={styles.wide} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const busy = acting !== null;
  const planActive = available && !!plan && plan.active;
  // 이번 기간의 내 회비 / 납부일 3일 전에 미리 생긴 다음 기간 / 지난 기간(미납을 위로)
  //   오늘을 덮는 행은 보통 하나지만, 주기를 바꿔 다시 켜면 옛 주기 행과 새 주기 행이 함께 있을 수 있다 → 모두 보여준다
  const currents = myDues.filter((d) => d.period_start <= today && d.period_end > today);
  const current = currents.find(unpaid) ?? currents[0] ?? null;
  const upcoming = myDues.filter((d) => d.period_start > today).reverse();
  const pastAll = myDues.filter((d) => d.period_end <= today);
  const unpaidPast = pastAll.filter(unpaid);
  const past = [...unpaidPast, ...pastAll.filter((d) => !unpaid(d))];
  const pastShown = showAllPast ? past : past.slice(0, Math.max(PAST_PREVIEW, unpaidPast.length));
  // 서버가 실제로 자동 청구하는 조건과 같게 본다(동의가 살아 있고·주기가 같고·금액이 동의 범위 안·카드 있음)
  const autopayOn = planActive && autopayCovers(mandate, plan, card, current?.amount);
  const needsReconsent = liveMandate && planActive && !autopayOn && !!card;
  // 등록할 수 있는 사람: 승인된 회원. 클럽장은 회비 대상에 포함됐을 때만.
  const canEnroll = planActive && isMember && (!status.is_owner || !!plan?.include_owner);
  // 인상이 예약됐는데 동의한 금액이 그보다 작다 → 다음 기간에 자동결제가 멈춘다. 미리 다시 동의할 수 있게 한다.
  const nextAmount = plan?.next_amount ?? 0;
  const raisePending = autopayOn && !!mandate && nextAmount > mandate.consented_amount;
  const cardLabel = card ? `${card.card_company ? `${card.card_company} ` : ''}${card.card_number_masked || '카드'}` : '';

  function goConsent() {
    router.push({ pathname: '/club/dues-consent', params: { clubId: club!.id } });
  }

  async function pay(d: ClubDues) {
    setNotice(null);
    setActing(`pay:${d.id}`);
    const res = await payDuesNow(d.id);
    setActing(null);
    if (!res.ok) {
      if (res.retryable) {
        Alert.alert('결제 확인 중', `${res.error}\n결과만 다시 확인해요. 새로 결제하지 않아요.`, [
          { text: '닫기', style: 'cancel', onPress: () => load() },
          { text: '결과 확인', onPress: () => check(d) },
        ]);
        return;
      }
      setNotice(`${periodLabel(d.period_key)} 회비 결제 실패 — ${res.error}`);
      Alert.alert(failureTitle(res, '결제 실패'), res.error);
      load();
      return;
    }
    Alert.alert('결제 완료', `${periodLabel(d.period_key)} 회비 ${won(res.amount ?? d.amount)}이 결제됐어요.`);
    load();
  }

  // 결제 중으로 남은 회비: 결과만 확인한다. 결제되지 않은 것으로 확인돼도 여기서 새로 결제하지 않는다.
  async function check(d: ClubDues) {
    setNotice(null);
    setActing(`pay:${d.id}`);
    const res = await checkDuesPayment(d.id);
    setActing(null);
    if (!res.ok) {
      setNotice(res.retryable ? '결제 결과를 아직 확인하지 못했어요. 잠시 후 다시 확인해주세요.' : res.error);
      Alert.alert(failureTitle(res, res.retryable ? '확인 중' : '확인 실패'), res.error);
    } else if (res.status === 'paid') {
      Alert.alert('결제 완료', `${periodLabel(d.period_key)} 회비 ${won(res.amount ?? d.amount)}이 결제됐어요.`);
    } else {
      setNotice(
        card && available
          ? `${periodLabel(d.period_key)} 회비는 결제되지 않았어요. 다시 결제하려면 "지금 결제"를 눌러주세요.`
          : `${periodLabel(d.period_key)} 회비는 결제되지 않았어요.`,
      );
    }
    load();
  }

  function confirmPay(d: ClubDues) {
    Alert.alert('지금 결제', `${periodLabel(d.period_key)} 회비 ${won(d.amount)}을 ${cardLabel}로 결제할까요?`, [
      { text: '닫기', style: 'cancel' },
      { text: '결제', onPress: () => pay(d) },
    ]);
  }

  function confirmRevoke() {
    Alert.alert('자동결제 해지', '이 클럽의 회비가 더 이상 자동으로 결제되지 않아요. 이미 생긴 회비는 그대로 남아요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '해지',
        style: 'destructive',
        onPress: async () => {
          setNotice(null);
          setActing('revoke');
          const res = await revokeDuesMandate(club!.id);
          setActing(null);
          if (!res.ok) {
            setNotice(res.error);
            Alert.alert(failureTitle(res, '해지 실패'), res.error);
          } else {
            setNotice('이 클럽의 자동결제를 해지했어요.');
          }
          load();
        },
      },
    ]);
  }

  function confirmDeleteCard() {
    Alert.alert('카드 삭제', '카드를 삭제하면 자동결제를 등록한 모든 클럽의 자동결제가 해지돼요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          setNotice(null);
          setActing('card');
          const res = await deleteDuesCard();
          setActing(null);
          if (!res.ok) {
            setNotice(res.error);
            Alert.alert(failureTitle(res, '삭제 실패'), res.error);
          } else {
            setNotice('카드를 삭제했어요. 자동결제도 모두 해지됐어요.');
          }
          load();
        },
      },
    ]);
  }

  async function selectPeriod(key: string) {
    if (key === periodRef.current) return;
    periodRef.current = key;
    setPeriodKey(key);
    setRosterLoading(true);
    const seq = ++rosterSeq.current;
    try {
      const rows = await fetchDuesRoster(club!.id, key);
      if (seq !== rosterSeq.current) return; // 그 사이 다른 기간을 골랐다
      rosterKeyRef.current = key;
      setRoster(rows);
    } catch {
      if (seq !== rosterSeq.current) return;
      // 못 읽었으면 지금 떠 있는 명단의 기간으로 선택을 되돌린다(칩 강조와 명단이 어긋나지 않게). 같은 칩을 다시 누르면 재시도.
      periodRef.current = rosterKeyRef.current;
      setPeriodKey(rosterKeyRef.current);
      Alert.alert('불러오기 실패', '납부 명단을 불러오지 못했어요. 기간을 다시 눌러주세요.');
    } finally {
      if (seq === rosterSeq.current) setRosterLoading(false);
    }
  }

  async function mark(row: ClubDuesRosterRow, action: 'cash_paid' | 'exempt' | 'revert') {
    setActing(`row:${row.dues_id}`);
    const res = await markDues(row.dues_id, action);
    setActing(null);
    if (!res.ok) Alert.alert(failureTitle(res, '처리 실패'), res.error);
    load();
  }

  async function refund(row: ClubDuesRosterRow) {
    if (!row.paid_charge_id) return;
    setActing(`row:${row.dues_id}`);
    const res = await refundDuesCharge(row.paid_charge_id, '운영진 환불');
    setActing(null);
    if (!res.ok) {
      if (res.retryable) {
        Alert.alert('환불 확인 중', `${res.error}\n다시 시도해도 이중으로 환불되지 않아요.`, [
          { text: '닫기', style: 'cancel', onPress: () => load() },
          { text: '다시 시도', onPress: () => refund(row) },
        ]);
        return;
      }
      Alert.alert(failureTitle(res, '환불 실패'), res.error);
      load();
      return;
    }
    Alert.alert('환불 완료', `${row.nickname}님에게 ${won(res.amount || row.amount)}을 환불했어요.`);
    load();
  }

  // 운영진이 명단의 한 줄을 눌렀을 때: 상태에 맞는 처리만 보여준다
  function openRow(row: ClubDuesRosterRow) {
    const head = `${row.nickname} · ${won(row.amount)}`;
    if (row.status === 'processing') {
      Alert.alert(head, '카드 결제가 진행 중이에요. 잠시 후 다시 확인해주세요.');
    } else if (row.status === 'open' || row.status === 'failed' || row.status === 'refunded') {
      Alert.alert(head, row.last_fail_reason && row.status !== 'refunded' ? `카드 결제 실패: ${row.last_fail_reason}` : '어떻게 처리할까요?', [
        { text: '닫기', style: 'cancel' },
        { text: '면제', onPress: () => mark(row, 'exempt') },
        { text: '현금 납부 확인', onPress: () => mark(row, 'cash_paid') },
      ]);
    } else if (row.status === 'exempt' || (row.status === 'paid' && row.paid_via === 'cash')) {
      Alert.alert(head, row.status === 'exempt' ? '면제를 취소하고 미납으로 되돌릴까요?' : '현금 납부 확인을 취소하고 미납으로 되돌릴까요?', [
        { text: '닫기', style: 'cancel' },
        { text: '되돌리기', style: 'destructive', onPress: () => mark(row, 'revert') },
      ]);
    } else if (row.status === 'paid' && row.paid_via === 'card') {
      if (!row.refundable) {
        Alert.alert(head, '카드로 납부했어요. 정산이 확정된 결제라 환불할 수 없어요.');
        return;
      }
      Alert.alert(head, `카드로 납부했어요. ${won(row.amount)}을 카드로 환불할까요? 피넛 수수료도 함께 환불되고, 이 회비는 정산에서 빠져요.`, [
        { text: '닫기', style: 'cancel' },
        { text: '환불', style: 'destructive', onPress: () => refund(row) },
      ]);
    }
  }

  // 내 회비 한 줄(이번 기간·다음 기간 공용)
  function duesRow(d: ClubDues, label?: string) {
    const payable = unpaid(d) && !!card && available;
    return (
      <View key={d.id} style={styles.block}>
        <View style={styles.rowBetween}>
          <View style={styles.flex}>
            <Text style={styles.line}>
              {label ? `${label} · ` : ''}
              {periodLabel(d.period_key)} · {won(d.amount)}
            </Text>
            <Text style={styles.sub}>납부일 {dayLabel(d.due_date)}</Text>
          </View>
          <Badge label={DUES_STATUS_LABEL[d.status]} color={STATUS_COLOR[d.status].color} bg={STATUS_COLOR[d.status].bg} />
        </View>
        {unpaid(d) && d.last_fail_reason ? <Text style={styles.warn}>카드 결제 실패: {d.last_fail_reason}</Text> : null}
        {d.status === 'processing' ? (
          <>
            <Text style={styles.sub}>카드 결제 결과를 확인하고 있어요. 확인만 하고, 새로 결제하지 않아요.</Text>
            <Button title="결과 다시 확인" variant="outline" onPress={() => check(d)} loading={acting === `pay:${d.id}`} disabled={busy} />
          </>
        ) : null}
        {payable && !label ? (
          <Button title={`지금 결제 (${won(d.amount)})`} onPress={() => confirmPay(d)} loading={acting === `pay:${d.id}`} disabled={busy} />
        ) : null}
      </View>
    );
  }

  const period = periods.find((p) => p.period_key === periodKey) ?? null;
  const showMine = hasMine || (planActive && isMember);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 클럽의 회비 규칙 */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{club.name}</Text>
          {!available ? (
            <>
              <Text style={styles.title}>{status.enabled ? '지금은 이 클럽에서 회비를 받지 않아요' : '지금은 회비 기능을 쓸 수 없어요'}</Text>
              <Text style={styles.sub}>
                {status.enabled ? '프리미엄 플러스 클럽만 회비를 받을 수 있어요. ' : ''}
                이미 낸 회비 기록, 자동결제 해지, 카드 삭제는 아래에서 그대로 할 수 있어요.
              </Text>
              {status.is_owner && status.enabled ? (
                <Button title="플랜 관리" variant="outline" onPress={() => router.push({ pathname: '/club/plan', params: { clubId: club.id } })} disabled={busy} />
              ) : null}
              {status.is_owner ? (
                <Button
                  title="정산 계좌·정산 내역"
                  variant="outline"
                  onPress={() => router.push({ pathname: '/club/dues-settings', params: { clubId: club.id } })}
                  disabled={busy}
                />
              ) : null}
            </>
          ) : planActive && plan ? (
            <>
              <Text style={styles.title}>{planSummary(plan)}</Text>
              {plan.first_period_start > today ? (
                <Text style={styles.sub}>
                  {plan.first_period_start.slice(0, 4)}년 {dayLabel(plan.first_period_start)}에 시작하는 기간부터 받아요.
                </Text>
              ) : null}
              {plan.next_amount && plan.next_amount_from ? (
                <Text style={styles.warn}>
                  {dayLabel(plan.next_amount_from)} 기간부터 {won(plan.next_amount)}으로 바뀌어요.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.title}>지금은 회비를 받고 있지 않아요</Text>
          )}
          {available && status.is_owner ? (
            <Button
              title="회비 설정"
              variant={planActive ? 'outline' : 'primary'}
              onPress={() => router.push({ pathname: '/club/dues-settings', params: { clubId: club.id } })}
              disabled={busy}
            />
          ) : null}
        </View>

        {/* 내 회비 */}
        {showMine ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>내 회비</Text>
            {currents.length > 0 ? (
              currents.map((d) => duesRow(d))
            ) : planActive && canEnroll ? (
              <Text style={styles.sub}>아직 이번 기간 회비가 없어요. 납부일 3일 전에 생겨요.</Text>
            ) : (
              <Text style={styles.sub}>이번 기간에 낼 회비가 없어요.</Text>
            )}
            {upcoming.map((d) => duesRow(d, '다음'))}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            {/* 자동결제 */}
            <View style={styles.divider} />
            {autopayOn ? (
              <>
                <Text style={styles.line}>자동결제 중 · {cardLabel}</Text>
                <Text style={styles.sub}>납부일 오전에 자동으로 결제돼요. 실패하면 하루 한 번, 최대 4회까지 다시 시도해요.</Text>
                {raisePending ? (
                  <>
                    <Text style={styles.warn}>
                      {plan?.next_amount_from ? dayLabel(plan.next_amount_from) : '다음'} 기간부터 회비가 {won(nextAmount)}으로 올라요. 미리 다시 동의해 두면 자동결제가
                      끊기지 않아요.
                    </Text>
                    {canEnroll ? <Button title="미리 다시 동의하기" variant="outline" onPress={goConsent} disabled={busy} /> : null}
                  </>
                ) : null}
              </>
            ) : needsReconsent ? (
              <>
                <Text style={styles.warn}>회비가 바뀌어 자동결제가 멈췄어요. 바뀐 내용을 확인하고 다시 동의해주세요.</Text>
                {canEnroll ? <Button title="다시 동의하기" onPress={goConsent} disabled={busy} /> : null}
              </>
            ) : liveMandate && !planActive ? (
              <Text style={styles.sub}>자동결제 동의는 남아 있지만, 지금은 이 클럽이 회비를 받지 않아 결제되지 않아요. 원하면 아래에서 해지할 수 있어요.</Text>
            ) : canEnroll ? (
              <>
                <Text style={styles.sub}>카드를 등록하면 납부일마다 자동으로 납부돼요.</Text>
                <Button title="자동결제 등록" onPress={goConsent} disabled={busy} />
              </>
            ) : planActive && status.is_owner ? (
              <Text style={styles.sub}>클럽장은 회비 대상이 아니에요. 회비 설정에서 포함할 수 있어요.</Text>
            ) : planActive ? (
              <Text style={styles.sub}>가입이 승인된 클럽 회원만 자동결제를 등록할 수 있어요.</Text>
            ) : null}
            {card ? (
              <>
                {!autopayOn ? <Text style={styles.sub}>등록된 카드 · {cardLabel}</Text> : null}
                <View style={styles.buttonRow}>
                  <Button
                    title="카드 변경"
                    variant="outline"
                    onPress={() => router.push({ pathname: '/payment/dues-card', params: { clubId: club.id, clubName: club.name, mode: 'replace' } })}
                    disabled={busy}
                    style={styles.flex}
                  />
                  <Button title="카드 삭제" variant="outline" onPress={confirmDeleteCard} loading={acting === 'card'} disabled={busy} style={styles.flex} />
                </View>
              </>
            ) : null}
            {liveMandate ? <Button title="자동결제 해지" variant="outline" onPress={confirmRevoke} loading={acting === 'revoke'} disabled={busy} /> : null}

            {/* 지난 기간 */}
            {past.length > 0 ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.subTitle}>지난 회비{unpaidPast.length > 0 ? ` · 미납 ${unpaidPast.length}건` : ''}</Text>
                {pastShown.map((d) => (
                  <View key={d.id} style={styles.rowBetween}>
                    <Text style={styles.sub}>
                      {periodLabel(d.period_key)} · {won(d.amount)}
                    </Text>
                    {unpaid(d) && card && available ? (
                      <Pressable onPress={() => confirmPay(d)} disabled={busy} hitSlop={6}>
                        <Text style={styles.link}>지금 결제</Text>
                      </Pressable>
                    ) : d.status === 'processing' ? (
                      <Pressable onPress={() => check(d)} disabled={busy} hitSlop={6}>
                        <Text style={styles.link}>결과 확인</Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.sub, { color: STATUS_COLOR[d.status].color }]}>{DUES_STATUS_LABEL[d.status]}</Text>
                    )}
                  </View>
                ))}
                {past.length > pastShown.length ? (
                  <Pressable onPress={() => setShowAllPast(true)} hitSlop={6}>
                    <Text style={styles.link}>지난 회비 모두 보기 ({past.length}건)</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {/* 운영진: 기간별 납부 명단 */}
        {showRoster ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>납부 현황</Text>
            {periods.length === 0 ? (
              <Text style={styles.sub}>아직 회비가 생긴 기간이 없어요.</Text>
            ) : (
              <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {periods.map((p) => (
                    <Pressable key={p.period_key} onPress={() => selectPeriod(p.period_key)} style={[styles.chip, p.period_key === periodKey && styles.chipOn]}>
                      <Text style={[styles.chipText, p.period_key === periodKey && styles.chipTextOn]}>{periodLabel(p.period_key)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {period ? (
                  <Text style={styles.sub}>
                    납부 {period.paid}명 · 면제 {period.exempt}명 · 미납 {period.unpaid}명 (대상 {period.total}명) · 받은 회비 {won(period.collected)}
                  </Text>
                ) : null}
                {rosterLoading ? (
                  <ActivityIndicator color="#16C784" style={styles.rosterLoading} />
                ) : (
                  roster.map((row) => (
                    <Pressable key={row.dues_id} onPress={() => openRow(row)} disabled={busy} style={styles.rosterRow}>
                      <View style={styles.flex}>
                        <Text style={styles.line} numberOfLines={1}>
                          {row.nickname}
                          {row.member_role === 'left' ? ' (탈퇴)' : ''}
                        </Text>
                        <Text style={styles.sub}>
                          {won(row.amount)}
                          {row.status === 'paid' ? ` · ${row.paid_via === 'cash' ? '현금' : '카드'}` : row.autopay ? ' · 자동결제' : ''}
                          {row.note ? ` · ${row.note}` : ''}
                        </Text>
                      </View>
                      {acting === `row:${row.dues_id}` ? (
                        <ActivityIndicator color="#16C784" />
                      ) : (
                        <Badge label={DUES_STATUS_LABEL[row.status]} color={STATUS_COLOR[row.status].color} bg={STATUS_COLOR[row.status].bg} />
                      )}
                    </Pressable>
                  ))
                )}
                <Text style={styles.footnote}>회원을 누르면 현금 납부 확인·면제·환불을 할 수 있어요.</Text>
              </>
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  wide: { alignSelf: 'stretch', marginTop: Spacing.two },
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
  block: { gap: 10 },
  eyebrow: { color: '#16C784', fontSize: 12, fontWeight: '900' },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', textAlign: 'left' },
  sectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  subTitle: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  line: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  sub: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warn: { color: '#F5A623', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  notice: {
    color: '#F8FAFC',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(245,166,35,0.12)',
    overflow: 'hidden',
  },
  link: { color: '#16C784', fontSize: 13, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  buttonRow: { flexDirection: 'row', gap: 10 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 2 },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipOn: { borderColor: '#16C784', backgroundColor: 'rgba(22,199,132,0.14)' },
  chipText: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#16C784' },
  rosterLoading: { paddingVertical: Spacing.three },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footnote: { color: '#707B87', fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
