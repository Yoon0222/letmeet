import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { won } from '@/lib/club-plan';
import { buildConsentText, consentAmount, CYCLE_NAME, dayLabel, enrollDues, fetchDuesPlan, fetchMyCard, planSummary } from '@/lib/dues';
import { AppAlert as Alert } from '@/lib/feedback';
import { supabase } from '@/lib/supabase';
import type { ClubDuesPlan, MemberBillingCard } from '@/lib/types';

const CHECKS = [
  '위 금액이 납부일마다 등록한 카드로 자동 결제되는 데 동의해요.',
  '결제는 가맹점 "피넛" 이름으로 청구되고, 피넛이 클럽에 정산한다는 것을 확인했어요.',
  '회비 화면에서 언제든 자동결제를 해지할 수 있다는 것을 확인했어요.',
];

// 회비 자동결제 동의 — 금액·주기·결제일·가맹점·해지 방법을 보여주고 필수 항목에 모두 동의받는다.
//   동의한 내용(금액·주기·안내문)은 그대로 서버에 보관된다. 서버는 그 내용이 지금 규칙과 같을 때만 받는다.
export default function DuesConsentScreen() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [clubName, setClubName] = useState('');
  const [plan, setPlan] = useState<ClubDuesPlan | null>(null);
  const [card, setCard] = useState<MemberBillingCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [checked, setChecked] = useState<boolean[]>(CHECKS.map(() => false));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clubId || !uid) return;
    const [{ data: club }, p, c] = await Promise.all([
      supabase.from('clubs').select('name').eq('id', clubId).maybeSingle(),
      fetchDuesPlan(clubId),
      fetchMyCard(uid),
    ]);
    setClubName(club?.name ?? '');
    setPlan(p);
    setCard(c);
    setLoading(false);
  }, [clubId, uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color="#16C784" />
        </View>
      </SafeAreaView>
    );
  }
  if (!plan || !plan.active) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.title}>이 클럽은 지금 회비를 받고 있지 않아요.</Text>
          <Button title="돌아가기" variant="outline" onPress={() => router.back()} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  const amount = consentAmount(plan);
  const text = buildConsentText(clubName, plan);
  const allChecked = checked.every(Boolean);

  function goCard() {
    // 카드 등록 화면이 이 화면을 대신한다 → 등록이 끝나면 회비 화면으로 돌아간다
    router.replace({
      pathname: '/payment/dues-card',
      params: { clubId: clubId!, clubName, mode: 'enroll', amount: String(amount), cycle: plan!.cycle },
    });
  }

  async function enrollWithSavedCard() {
    setSaving(true);
    const res = await enrollDues({ clubId: clubId!, consent: { amount, cycle: plan!.cycle, text } });
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'plan_changed') {
        Alert.alert('회비 내용이 바뀌었어요', '바뀐 내용을 다시 확인해주세요.');
        setChecked(CHECKS.map(() => false));
        load();
        return;
      }
      if (res.code === 'card_required') {
        goCard();
        return;
      }
      Alert.alert('등록 실패', res.error);
      return;
    }
    const c = res.charge;
    const message =
      c.status === 'paid'
        ? `회비 ${won(c.amount ?? amount)}이 결제됐어요. 다음부터는 납부일에 자동으로 결제돼요.`
        : c.status === 'failed'
          ? `자동결제는 등록됐지만 이번 회비 결제는 실패했어요.${c.reason ? `\n${c.reason}` : ''}\n회비 화면에서 다시 결제할 수 있어요.`
          : c.status === 'unknown'
            ? '자동결제를 등록했어요. 이번 회비 결제는 결과를 확인하고 있어요 — 잠시 후 회비 화면에서 확인해주세요.'
            : '자동결제를 등록했어요. 납부일에 자동으로 결제돼요.';
    Alert.alert('자동결제 등록 완료', message, [{ text: '확인', onPress: () => router.back() }]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{clubName}</Text>
          <Text style={styles.title}>
            {CYCLE_NAME[plan.cycle]} {won(amount)}
          </Text>
          <Text style={styles.sub}>{planSummary({ ...plan, amount })}</Text>
          {plan.next_amount && plan.next_amount > plan.amount ? (
            <Text style={styles.warn}>
              {plan.next_amount_from ? dayLabel(plan.next_amount_from) : '다음'} 기간부터 {won(plan.next_amount)}으로 올라요. 그 전까지는 {won(plan.amount)}이 결제돼요.
            </Text>
          ) : null}
          <Text style={styles.sub}>납부일이 이미 지난 미납 회비가 있으면 등록 직후 바로 결제돼요.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>자동결제 안내</Text>
          <Text style={styles.consentText}>{text}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>필수 동의</Text>
          {CHECKS.map((label, i) => (
            <Pressable
              key={label}
              onPress={() => setChecked((prev) => prev.map((v, j) => (j === i ? !v : v)))}
              style={styles.checkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: checked[i] }}>
              <Ionicons name={checked[i] ? 'checkbox' : 'square-outline'} size={22} color={checked[i] ? '#16C784' : '#707B87'} />
              <Text style={styles.checkLabel}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {card ? (
          <>
            <Button
              title={`등록된 카드로 시작 (${card.card_company ? `${card.card_company} ` : ''}${card.card_number_masked || '카드'})`}
              onPress={enrollWithSavedCard}
              loading={saving}
              disabled={!allChecked}
            />
            <Button title="다른 카드 등록하고 시작" variant="outline" onPress={goCard} disabled={!allChecked || saving} />
          </>
        ) : (
          <Button title="동의하고 카드 등록" onPress={goCard} disabled={!allChecked} />
        )}
        <Text style={styles.footnote}>카드 등록은 토스페이먼츠 화면에서 진행돼요. 카드 정보는 피넛에 저장되지 않아요.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  wide: { alignSelf: 'stretch' },
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
  eyebrow: { color: '#16C784', fontSize: 12, fontWeight: '900' },
  title: { color: '#F8FAFC', fontSize: 20, fontWeight: '900' },
  sectionTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '900' },
  sub: { color: '#AAB4C0', fontSize: 13, lineHeight: 19, fontWeight: '600' },
  warn: { color: '#F5A623', fontSize: 13, lineHeight: 19, fontWeight: '700' },
  consentText: { color: '#AAB4C0', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  checkLabel: { flex: 1, color: '#F8FAFC', fontSize: 14, lineHeight: 20, fontWeight: '700' },
  footnote: { color: '#707B87', fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
});
