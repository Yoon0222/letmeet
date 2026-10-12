import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { CLUB_DUES_ENABLED } from '@/constants/features';
import { Spacing } from '@/constants/theme';
import { won } from '@/lib/club-plan';
import {
  CYCLE_NAME,
  dayLabel,
  disableDuesPlan,
  feePercent,
  fetchDuesPlan,
  fetchDuesStatus,
  fetchPayoutAccount,
  fetchSettlements,
  planSummary,
  setDuesPlan,
  setPayoutAccount,
} from '@/lib/dues';
import { AppAlert as Alert } from '@/lib/feedback';
import type { ClubDuesPlan, ClubDuesSettlement, ClubDuesStatus, ClubPayoutAccountMasked, DuesCycle } from '@/lib/types';

const CYCLES: DuesCycle[] = ['monthly', 'quarterly', 'yearly'];
const SETTLEMENT_STATUS: Record<ClubDuesSettlement['status'], string> = { draft: '정산 준비 중', confirmed: '정산 확정', paid: '입금 완료' };
const digits = (v: string) => v.replace(/[^0-9]/g, '');

// 회비 설정(클럽장) — 정산 계좌 → 회비 규칙(주기·금액·납부일) → 켜기/끄기, 그리고 정산 내역.
//   저장·검증은 서버 함수가 한다. 금액 변경은 다음 기간부터, 주기 변경은 끄고 다시 설정.
export default function DuesSettingsScreen() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();

  const [status, setStatus] = useState<ClubDuesStatus | null>(null);
  const [plan, setPlan] = useState<ClubDuesPlan | null>(null);
  const [account, setAccount] = useState<ClubPayoutAccountMasked | null>(null);
  const [settlements, setSettlements] = useState<ClubDuesSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [today, setToday] = useState(''); // 오늘(KST)
  const [formReady, setFormReady] = useState(false);

  // 회비 규칙 입력
  const [cycle, setCycle] = useState<DuesCycle>('monthly');
  const [amountText, setAmountText] = useState('');
  const [dueDayText, setDueDayText] = useState('10');
  const [startMonthText, setStartMonthText] = useState('1');
  const [includeOwner, setIncludeOwner] = useState(false);

  // 정산 계좌 입력
  const [editingAccount, setEditingAccount] = useState(false);
  const [holderType, setHolderType] = useState<'individual' | 'business'>('individual');
  const [holderName, setHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [businessNumber, setBusinessNumber] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const load = useCallback(async () => {
    if (!clubId) return;
    const st = await fetchDuesStatus(clubId);
    if (!st) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    if (!st.is_owner) {
      Alert.alert('접근할 수 없어요', '클럽장만 회비를 설정할 수 있어요.', [{ text: '확인', onPress: () => router.back() }]);
      return;
    }
    const [pl, acc, sets] = await Promise.all([fetchDuesPlan(clubId), fetchPayoutAccount(clubId), fetchSettlements(clubId)]);
    setToday(new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
    setStatus(st);
    setPlan(pl);
    setAccount(acc);
    setSettlements(sets);
    // 입력란은 처음 한 번만 서버 값으로 채운다(다시 포커스될 때 입력 중인 값을 덮어쓰지 않게)
    if (!formReady) {
      if (pl) {
        setCycle(pl.cycle);
        setAmountText(String(pl.next_amount ?? pl.amount));
        setDueDayText(String(pl.due_day));
        setStartMonthText(String(pl.start_month));
        setIncludeOwner(pl.include_owner);
      }
      setFormReady(true);
    }
    setLoadFailed(false);
    setLoading(false);
  }, [clubId, router, formReady]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>회비 설정을 불러오지 못했어요</Text>
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
  if (loading || !status) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" />
        </View>
      </SafeAreaView>
    );
  }
  if (!CLUB_DUES_ENABLED || !status.enabled || !status.plus) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>{!status.plus && status.enabled ? '프리미엄 플러스 클럽에서 쓸 수 있어요' : '회비 기능은 아직 준비 중이에요'}</Text>
          {status.enabled && !status.plus ? (
            <Button title="플랜 관리" onPress={() => router.push({ pathname: '/club/plan', params: { clubId: clubId! } })} style={styles.wide} />
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  const planActive = !!plan && plan.active;
  const busy = saving !== null;
  const showAccountForm = editingAccount || !account;

  async function saveAccount() {
    setSaving('account');
    const res = await setPayoutAccount({
      clubId: clubId!,
      holderType,
      holderName: holderName.trim(),
      bankName: bankName.trim(),
      accountNumber: digits(accountNumber),
      businessNumber: digits(businessNumber) || null,
      contactPhone: digits(contactPhone),
      contactEmail: contactEmail.trim() || null,
    });
    setSaving(null);
    if (!res.ok) {
      Alert.alert('저장 실패', res.error);
      return;
    }
    setEditingAccount(false);
    setAccountNumber('');
    Alert.alert('정산 계좌 저장', '계좌를 저장했어요. 피넛이 계좌를 확인한 뒤부터 정산이 진행돼요.');
    load();
  }

  async function savePlan() {
    const amount = Number(digits(amountText));
    const dueDay = Number(digits(dueDayText));
    const startMonth = Number(digits(startMonthText)) || 1;
    if (!amount || amount < 1000 || amount % 100 !== 0) {
      Alert.alert('입력 확인', '회비는 1,000원 이상, 100원 단위로 입력해주세요.');
      return;
    }
    if (!dueDay || dueDay < 1 || dueDay > 28) {
      Alert.alert('입력 확인', '납부일은 1일부터 28일 사이로 입력해주세요.');
      return;
    }
    if (cycle === 'yearly' && (startMonth < 1 || startMonth > 12)) {
      Alert.alert('입력 확인', '시작 월은 1월부터 12월 사이로 입력해주세요.');
      return;
    }
    setSaving('plan');
    const res = await setDuesPlan({ clubId: clubId!, cycle, amount, dueDay, startMonth, includeOwner });
    setSaving(null);
    if (!res.ok) {
      Alert.alert('저장 실패', res.error);
      return;
    }
    const next = await fetchDuesPlan(clubId!);
    setPlan(next);
    if (next) {
      const scheduled = next.next_amount && next.next_amount_from ? `\n${dayLabel(next.next_amount_from)} 기간부터 ${won(next.next_amount)}으로 바뀌어요.` : '';
      Alert.alert(
        planActive ? '회비 설정 저장' : '회비를 켰어요',
        planActive
          ? `${planSummary(next)}${scheduled}`
          : `${planSummary(next)}\n첫 납부 기간은 ${next.first_period_start.slice(0, 4)}년 ${dayLabel(next.first_period_start)}에 시작해요. 회원들에게 안내를 보냈어요.${scheduled}`,
      );
    }
    load();
  }

  function confirmDisable() {
    Alert.alert('회비 끄기', '이번 기간과 앞으로의 미납 회비는 없던 일이 되고, 자동결제도 멈춰요. 이미 받은 회비와 정산은 그대로예요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '회비 끄기',
        style: 'destructive',
        onPress: async () => {
          setSaving('disable');
          const res = await disableDuesPlan(clubId!);
          setSaving(null);
          if (!res.ok) Alert.alert('실패', res.error);
          load();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 1) 정산 계좌 */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>정산 계좌</Text>
              {account ? (
                <Badge
                  label={account.verified ? '확인 완료' : '확인 대기'}
                  color={account.verified ? '#16C784' : '#F5A623'}
                  bg={account.verified ? 'rgba(22,199,132,0.14)' : 'rgba(245,166,35,0.14)'}
                />
              ) : null}
            </View>
            <Text style={styles.sub}>
              회원이 낸 회비는 피넛이 대신 받아 매월 이 계좌로 정산해요.
              {status.fee_bps !== null ? ` 수수료는 결제 금액의 ${feePercent(status.fee_bps)}(카드 수수료 포함)예요.` : ''}
            </Text>
            {account && !showAccountForm ? (
              <>
                <Text style={styles.line}>
                  {account.bank_name} {account.account_masked} · {account.holder_name}
                </Text>
                {!account.verified ? <Text style={styles.sub}>피넛이 계좌를 확인하고 있어요. 확인이 끝나야 정산이 진행돼요.</Text> : null}
                <Button
                  title="계좌 변경"
                  variant="outline"
                  onPress={() => {
                    setHolderType(account.holder_type);
                    setHolderName(account.holder_name);
                    setBankName(account.bank_name);
                    setContactPhone(account.contact_phone);
                    setContactEmail(account.contact_email ?? '');
                    setAccountNumber('');
                    setBusinessNumber('');
                    setEditingAccount(true);
                  }}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                {account ? <Text style={styles.warn}>계좌를 바꾸면 피넛의 확인을 다시 받아야 해요.</Text> : null}
                <View style={styles.chipRow}>
                  {(['individual', 'business'] as const).map((t) => (
                    <Pressable key={t} onPress={() => setHolderType(t)} style={[styles.chip, holderType === t && styles.chipOn]}>
                      <Text style={[styles.chipText, holderType === t && styles.chipTextOn]}>{t === 'individual' ? '개인' : '사업자'}</Text>
                    </Pressable>
                  ))}
                </View>
                <TextField label="예금주" value={holderName} onChangeText={setHolderName} placeholder="통장에 적힌 이름" maxLength={40} />
                <TextField label="은행" value={bankName} onChangeText={setBankName} placeholder="예: 국민은행" maxLength={30} />
                <TextField label="계좌번호" value={accountNumber} onChangeText={setAccountNumber} placeholder="숫자만 입력" keyboardType="number-pad" maxLength={24} />
                {holderType === 'business' ? (
                  <TextField label="사업자등록번호" value={businessNumber} onChangeText={setBusinessNumber} placeholder="10자리" keyboardType="number-pad" maxLength={12} />
                ) : null}
                <TextField label="연락처" value={contactPhone} onChangeText={setContactPhone} placeholder="정산 관련 연락을 받을 번호" keyboardType="phone-pad" maxLength={13} />
                <TextField label="이메일 (선택)" value={contactEmail} onChangeText={setContactEmail} placeholder="정산 내역을 받을 이메일" keyboardType="email-address" autoCapitalize="none" maxLength={80} />
                <Button title="계좌 저장" onPress={saveAccount} loading={saving === 'account'} disabled={busy} />
                {account ? <Button title="취소" variant="outline" onPress={() => setEditingAccount(false)} disabled={busy} /> : null}
              </>
            )}
          </View>

          {/* 2) 회비 규칙 */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.sectionTitle}>회비 규칙</Text>
              <Badge
                label={planActive ? '받는 중' : '꺼짐'}
                color={planActive ? '#16C784' : '#AAB4C0'}
                bg={planActive ? 'rgba(22,199,132,0.14)' : 'rgba(255,255,255,0.07)'}
              />
            </View>
            {planActive && plan ? (
              <>
                <Text style={styles.line}>{planSummary(plan)}</Text>
                {plan.first_period_start > today ? (
                  <Text style={styles.sub}>
                    {plan.first_period_start.slice(0, 4)}년 {dayLabel(plan.first_period_start)}에 시작하는 기간부터 받아요. 그 전 기간은 청구되지 않아요.
                  </Text>
                ) : null}
                {plan.next_amount && plan.next_amount_from ? (
                  <Text style={styles.warn}>
                    {dayLabel(plan.next_amount_from)} 기간부터 {won(plan.next_amount)}으로 바뀌어요.
                  </Text>
                ) : null}
              </>
            ) : null}
            {!account ? (
              <Text style={styles.warn}>정산 계좌를 먼저 등록해야 회비를 켤 수 있어요.</Text>
            ) : (
              <>
                <Text style={styles.label}>주기</Text>
                <View style={styles.chipRow}>
                  {CYCLES.map((c) => (
                    <Pressable key={c} onPress={() => setCycle(c)} disabled={planActive} style={[styles.chip, cycle === c && styles.chipOn, planActive && cycle !== c && styles.chipOff]}>
                      <Text style={[styles.chipText, cycle === c && styles.chipTextOn]}>{CYCLE_NAME[c]}</Text>
                    </Pressable>
                  ))}
                </View>
                {planActive ? <Text style={styles.sub}>주기를 바꾸려면 회비를 끈 뒤 다시 설정해주세요. 이미 받은 기간과 겹치지 않는 기간부터 다시 시작해요.</Text> : null}
                <TextField
                  label="회비 (원)"
                  value={amountText}
                  onChangeText={(v) => setAmountText(digits(v))}
                  placeholder="예: 30000"
                  keyboardType="number-pad"
                  maxLength={7}
                  hint={planActive ? '금액을 바꾸면 다음 기간부터 적용돼요. 올리면 회원이 다시 동의해야 자동결제가 이어져요.' : '100원 단위'}
                />
                {cycle === 'yearly' ? (
                  <TextField
                    label="시작 월"
                    value={startMonthText}
                    onChangeText={(v) => setStartMonthText(digits(v))}
                    placeholder="1~12"
                    keyboardType="number-pad"
                    maxLength={2}
                    editable={!planActive}
                    hint="이 달에 1년치 회비를 받아요."
                  />
                ) : null}
                <TextField
                  label="납부일"
                  value={dueDayText}
                  onChangeText={(v) => setDueDayText(digits(v))}
                  placeholder="1~28"
                  keyboardType="number-pad"
                  maxLength={2}
                  hint={cycle === 'monthly' ? '매월 이 날 오전에 자동 결제돼요.' : cycle === 'quarterly' ? '1·4·7·10월의 이 날 오전에 자동 결제돼요.' : '시작 월의 이 날 오전에 자동 결제돼요.'}
                />
                <Pressable onPress={() => setIncludeOwner((v) => !v)} style={styles.toggleRow}>
                  <View style={[styles.checkbox, includeOwner && styles.checkboxOn]} />
                  <Text style={styles.line}>클럽장도 회비 대상에 포함</Text>
                </Pressable>
                <Button title={planActive ? '변경사항 저장' : '회비 켜기'} onPress={savePlan} loading={saving === 'plan'} disabled={busy} />
                {planActive ? <Button title="회비 끄기" variant="outline" onPress={confirmDisable} loading={saving === 'disable'} disabled={busy} /> : null}
                <Text style={styles.footnote}>
                  납부일 3일 전에 회원에게 안내가 가고, 납부일 이후에 가입이 승인된 회원은 다음 기간부터 대상이에요. 현금으로 받은 회비는 회비 화면의 납부 현황에서 처리할 수 있어요.
                </Text>
              </>
            )}
          </View>

          {/* 3) 정산 내역 */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>정산 내역</Text>
            {settlements.length === 0 ? (
              <Text style={styles.sub}>아직 정산 내역이 없어요. 매월 초에 지난달 회비를 정산해요.</Text>
            ) : (
              settlements.map((s) => (
                <View key={s.id} style={styles.settleRow}>
                  <View style={styles.flex}>
                    <Text style={styles.line}>
                      {s.period_month.slice(0, 4)}년 {Number(s.period_month.slice(5, 7))}월 · {won(s.net_amount)}
                    </Text>
                    <Text style={styles.sub}>
                      받은 회비 {won(s.gross_amount)}
                      {s.refund_amount > 0 ? ` − 환불 ${won(s.refund_amount)}` : ''} − 수수료 {won(s.fee_amount)}
                    </Text>
                  </View>
                  <Text style={[styles.sub, s.status === 'paid' && styles.ok]}>{SETTLEMENT_STATUS[s.status]}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  wide: { alignSelf: 'stretch', marginTop: Spacing.two },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 80 },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 12,
  },
  title: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', textAlign: 'center' },
  sectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900' },
  label: { color: '#AAB4C0', fontSize: 13, fontWeight: '700', marginLeft: 2 },
  line: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  sub: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warn: { color: '#F5A623', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  ok: { color: '#16C784' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipOn: { borderColor: '#16C784', backgroundColor: 'rgba(22,199,132,0.14)' },
  chipOff: { opacity: 0.4 },
  chipText: { color: '#AAB4C0', fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: '#16C784' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#707B87' },
  checkboxOn: { borderColor: '#16C784', backgroundColor: '#16C784' },
  settleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  footnote: { color: '#707B87', fontSize: 12, lineHeight: 17, fontWeight: '600' },
});
