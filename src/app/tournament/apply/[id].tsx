import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { createTournamentEntryPayment, isTossConfigured } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { TOURNAMENT_FORMAT_LABELS } from '@/lib/types';
import type { PartnerProfile, TournamentWithCounts } from '@/lib/types';

type EntrySummary = { user_id: string; partner_id: string | null; status: string };

export default function TournamentApplyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const theme = useTheme();
  const { session, profile } = useAuth();
  const uid = session?.user.id;

  const [tournament, setTournament] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [partnerQuery, setPartnerQuery] = useState('');
  const [partnerResults, setPartnerResults] = useState<PartnerProfile[]>([]);
  const [partner, setPartner] = useState<PartnerProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [withoutPartner, setWithoutPartner] = useState(false);
  const [rulesAgreed, setRulesAgreed] = useState(false);
  const [refundAgreed, setRefundAgreed] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: '대회 참가 신청' });
  }, [navigation]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase.from('tournament_entries').select('user_id, partner_id, status').eq('tournament_id', id),
    ]).then(([tourResult, entryResult]) => {
      if (tourResult.error || !tourResult.data) {
        Alert.alert('대회를 불러오지 못했어요', tourResult.error?.message ?? '대회 정보를 확인해 주세요.');
        router.back();
        return;
      }
      setTournament(tourResult.data);
      setEntries((entryResult.data as EntrySummary[]) ?? []);
      setLoading(false);
    });
  }, [id, router]);

  useEffect(() => {
    const query = partnerQuery.trim();
    if (!query || partner || withoutPartner) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPartnerResults([]);
      return;
    }
    setSearching(true);
    const taken = new Set(entries.flatMap((entry) => [entry.user_id, entry.partner_id]).filter(Boolean));
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, nickname, skill_level, avatar_url, region')
        .ilike('nickname', `%${query}%`)
        .neq('id', uid ?? '')
        .limit(16);
      setPartnerResults(((data as PartnerProfile[]) ?? []).filter((item) => !taken.has(item.id)).slice(0, 8));
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [entries, partner, partnerQuery, uid, withoutPartner]);

  const isDoubles = tournament?.discipline === 'doubles';
  const activeCount = useMemo(
    () => entries.filter((entry) => entry.status === 'pending' || entry.status === 'approved').length,
    [entries],
  );
  const slotsFull = !!tournament && activeCount >= tournament.max_participants;

  function validateEligibility() {
    if (!tournament || !profile) return false;
    if (entries.some((entry) => entry.user_id === uid || entry.partner_id === uid)) {
      Alert.alert('이미 참가 중이에요', '신청자 또는 파트너로 이미 등록되어 있어요.');
      return false;
    }
    if (tournament.dupr_premium && !(profile.dupr_status === 'verified' && profile.dupr_premium && profile.dupr_verified_l1)) {
      Alert.alert('DUPR+ 자격이 필요해요', 'DUPR+ 전용 대회는 PREMIUM과 VERIFIED 자격이 모두 필요해요.');
      return false;
    }
    if (tournament.dupr_certified && !(profile.dupr_status === 'verified' && profile.dupr_basic)) {
      Alert.alert('DUPR 인증이 필요해요', 'DUPR 계정을 연결하고 활성 상태를 확인해 주세요.');
      return false;
    }
    if (tournament.fee > 0 && !slotsFull && !isTossConfigured) {
      Alert.alert('결제 준비 중', '참가비 결제 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.');
      return false;
    }
    return true;
  }

  function goNext() {
    if (isDoubles && !partner && !withoutPartner) {
      Alert.alert('파트너 정보를 확인해 주세요', '파트너를 선택하거나 파트너 없이 신청하기를 선택해 주세요.');
      return;
    }
    if (validateEligibility()) setStep(2);
  }

  async function submit() {
    if (!uid || !id || !tournament || !rulesAgreed || !refundAgreed) return;
    setSubmitting(true);
    const { error } = await supabase.from('tournament_entries').insert({
      tournament_id: id,
      user_id: uid,
      partner_id: isDoubles ? partner?.id ?? null : null,
      partner_name: isDoubles ? partner?.nickname ?? null : null,
    });
    if (error) {
      setSubmitting(false);
      Alert.alert('신청하지 못했어요', error.message);
      return;
    }

    if (tournament.fee > 0 && !slotsFull) {
      const payment = await createTournamentEntryPayment({ tournamentId: id, title: tournament.title, fee: tournament.fee, uid });
      setSubmitting(false);
      if (!payment.ok) {
        Alert.alert('결제 준비 실패', payment.message ?? '대회 상세에서 다시 결제해 주세요.');
        router.replace(`/tournament/${id}` as never);
        return;
      }
      router.replace({
        pathname: '/payment/court',
        params: {
          kind: 'tournament', tournamentId: id, paymentId: payment.paymentId,
          orderId: payment.orderId, orderName: payment.orderName, amount: String(payment.amount),
        },
      } as never);
      return;
    }

    setSubmitting(false);
    Alert.alert(slotsFull ? '대기 신청이 완료됐어요' : '참가 신청이 완료됐어요', slotsFull ? '자리가 생기면 알림으로 알려드릴게요.' : '대회 상세에서 신청 상태를 확인할 수 있어요.', [
      { text: '확인', onPress: () => router.replace(`/tournament/${id}` as never) },
    ]);
  }

  if (loading || !tournament) {
    return <SafeAreaView style={[styles.screen, styles.center, { backgroundColor: theme.background }]}><ActivityIndicator color={theme.primary} /></SafeAreaView>;
  }

  const feeText = tournament.fee > 0 ? `${tournament.fee.toLocaleString()}원` : '무료';
  const finalTitle = slotsFull ? '대기 신청 완료' : tournament.fee > 0 ? `신청하고 결제 · ${feeText}` : '참가 신청 완료';

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.summary, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={styles.summaryTop}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: theme.primary }]}>{TOURNAMENT_FORMAT_LABELS[tournament.format]} · {isDoubles ? '복식' : '단식'}</Text>
              <Text style={[styles.title, { color: theme.text }]}>{tournament.title}</Text>
            </View>
            {slotsFull ? <View style={styles.waitBadge}><Text style={styles.waitBadgeText}>대기 접수</Text></View> : null}
          </View>
          <Meta icon="calendar-outline" text={formatMeetupTime(tournament.start_at)} />
          <Meta icon="location-outline" text={`${tournament.venue || '장소 미정'}${tournament.region ? ` · ${tournament.region}` : ''}`} />
        </View>

        <View style={styles.progress}>
          <StepDot number="1" label="참가 정보" active={step === 1} done={step === 2} />
          <View style={[styles.progressLine, { backgroundColor: step === 2 ? theme.primary : theme.border }]} />
          <StepDot number="2" label="신청 확인" active={step === 2} done={false} />
        </View>

        {step === 1 ? (
          <>
            <SectionTitle number="01" title="신청자" />
            <View style={[styles.personRow, { borderColor: theme.border }]}>
              <Avatar nickname={profile?.nickname ?? '나'} uri={profile?.avatar_url} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.personName, { color: theme.text }]}>{profile?.nickname ?? '내 프로필'}</Text>
                <Text style={[styles.secondary, { color: theme.textSecondary }]}>{profile ? `${profile.region || '지역 미설정'} · ${profile.skill_level.toFixed(1)} ${skillLabel(profile.skill_level)}` : ''}</Text>
              </View>
              <View style={[styles.meBadge, { backgroundColor: theme.backgroundSelected }]}><Text style={[styles.meText, { color: theme.primary }]}>본인</Text></View>
            </View>

            {isDoubles ? (
              <>
                <SectionTitle number="02" title="복식 파트너" />
                {partner ? (
                  <View style={[styles.personRow, { borderColor: theme.primary, backgroundColor: theme.backgroundSelected }]}>
                    <Avatar nickname={partner.nickname} uri={partner.avatar_url} size={44} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.personName, { color: theme.text }]}>{partner.nickname}</Text>
                      <Text style={[styles.secondary, { color: theme.textSecondary }]}>{partner.region || '지역 미설정'} · {partner.skill_level.toFixed(1)} {skillLabel(partner.skill_level)}</Text>
                    </View>
                    <Pressable onPress={() => { setPartner(null); setPartnerQuery(''); }} hitSlop={10}><Ionicons name="close-circle" size={24} color={theme.textSecondary} /></Pressable>
                  </View>
                ) : (
                  <View style={[styles.searchBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="search" size={20} color={theme.textSecondary} />
                    <TextInput value={partnerQuery} onChangeText={setPartnerQuery} editable={!withoutPartner} placeholder="닉네임으로 파트너 검색" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.text }]} />
                    {searching ? <ActivityIndicator size="small" color={theme.primary} /> : null}
                  </View>
                )}
                {partnerResults.map((item) => (
                  <Pressable key={item.id} onPress={() => { setPartner(item); setPartnerQuery(item.nickname); setPartnerResults([]); }} style={[styles.resultRow, { borderColor: theme.border }]}>
                    <Avatar nickname={item.nickname} uri={item.avatar_url} size={36} />
                    <View style={{ flex: 1 }}><Text style={[styles.personName, { color: theme.text }]}>{item.nickname}</Text><Text style={[styles.secondary, { color: theme.textSecondary }]}>{item.region || '지역 미설정'} · {item.skill_level.toFixed(1)}</Text></View>
                    <Ionicons name="add-circle-outline" size={23} color={theme.primary} />
                  </Pressable>
                ))}
                <CheckRow checked={withoutPartner} label="파트너 없이 먼저 신청하기" detail="대진 생성 전까지 파트너를 등록할 수 있어요." onPress={() => { setWithoutPartner((value) => !value); setPartner(null); setPartnerQuery(''); }} />
              </>
            ) : null}

            <SectionTitle number={isDoubles ? '03' : '02'} title="참가 조건" />
            <View style={[styles.conditions, { borderColor: theme.border }]}>
              <Condition icon="ribbon-outline" label="참가 실력" value={skillRangeLabel(tournament.skill_min, tournament.skill_max)} />
              <Condition icon="people-outline" label="접수 현황" value={`${activeCount}/${tournament.max_participants}${isDoubles ? '팀' : '명'}`} />
              <Condition icon="wallet-outline" label="참가비" value={feeText} last />
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.confirmTitle, { color: theme.text }]}>신청 내용을 확인해 주세요</Text>
            <Text style={[styles.confirmSub, { color: theme.textSecondary }]}>신청 완료 후에도 대진 생성 전까지 파트너를 변경할 수 있어요.</Text>
            <View style={[styles.review, { borderColor: theme.border }]}>
              <Review label="대회" value={tournament.title} />
              <Review label="참가자" value={isDoubles ? `${profile?.nickname ?? '나'} / ${partner?.nickname ?? '파트너 미정'}` : profile?.nickname ?? '나'} warn={isDoubles && !partner} />
              <Review label="일시" value={formatMeetupTime(tournament.start_at)} />
              <Review label="참가비" value={feeText} last />
            </View>
            {slotsFull ? <View style={styles.notice}><Ionicons name="time-outline" size={20} color="#FBBF24" /><Text style={styles.noticeText}>현재 정원이 가득 차 대기 신청으로 접수됩니다. 자리가 생기면 알림을 보내드려요.</Text></View> : null}
            <View style={styles.agreements}>
              <CheckRow checked={rulesAgreed} label="대회 운영 규정에 동의합니다" onPress={() => setRulesAgreed((value) => !value)} />
              <CheckRow checked={refundAgreed} label="취소 및 환불 기준을 확인했습니다" onPress={() => setRefundAgreed((value) => !value)} />
              <Pressable onPress={() => Alert.alert('대회 규정', tournament.description || '대회 운영 규정은 주최자 안내를 따릅니다.')} style={styles.rulesLink}><Text style={[styles.rulesLinkText, { color: theme.primary }]}>대회 규정 보기</Text><Ionicons name="chevron-forward" size={16} color={theme.primary} /></Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.background, borderColor: theme.border }]}>
        {step === 1 ? (
          <><View><Text style={[styles.footerLabel, { color: theme.textSecondary }]}>참가비</Text><Text style={[styles.footerPrice, { color: theme.text }]}>{feeText}</Text></View><Button title="다음" icon="arrow-forward" onPress={goNext} style={{ flex: 1 }} /></>
        ) : (
          <><Button title="이전" variant="outline" onPress={() => setStep(1)} style={styles.backButton} /><Button title={finalTitle} onPress={submit} loading={submitting} disabled={!rulesAgreed || !refundAgreed} style={{ flex: 1 }} /></>
        )}
      </View>
    </SafeAreaView>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return <View style={styles.meta}><Ionicons name={icon} size={16} color="#AAB4C0" /><Text style={styles.metaText}>{text}</Text></View>;
}

function StepDot({ number, label, active, done }: { number: string; label: string; active: boolean; done: boolean }) {
  return <View style={styles.step}><View style={[styles.stepDot, (active || done) && styles.stepDotActive]}>{done ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Text style={[styles.stepNumber, active && styles.stepNumberActive]}>{number}</Text>}</View><Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{label}</Text></View>;
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return <View style={styles.sectionTitleRow}><Text style={styles.sectionNumber}>{number}</Text><Text style={styles.sectionTitle}>{title}</Text></View>;
}

function Condition({ icon, label, value, last = false }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return <View style={[styles.condition, !last && styles.divider]}><Ionicons name={icon} size={19} color="#16C784" /><Text style={styles.conditionLabel}>{label}</Text><Text style={styles.conditionValue}>{value}</Text></View>;
}

function Review({ label, value, warn = false, last = false }: { label: string; value: string; warn?: boolean; last?: boolean }) {
  return <View style={[styles.reviewRow, !last && styles.divider]}><Text style={styles.reviewLabel}>{label}</Text><Text style={[styles.reviewValue, warn && styles.warnText]}>{value}</Text></View>;
}

function CheckRow({ checked, label, detail, onPress }: { checked: boolean; label: string; detail?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.checkRow}><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? '#16C784' : '#707B87'} /><View style={{ flex: 1 }}><Text style={styles.checkLabel}>{label}</Text>{detail ? <Text style={styles.checkDetail}>{detail}</Text> : null}</View></Pressable>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.three, paddingBottom: 132, gap: 16 },
  summary: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 8 }, summaryTop: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  eyebrow: { fontSize: 12, fontWeight: '800' }, title: { fontSize: 21, fontWeight: '800', marginTop: 5 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 }, metaText: { color: '#AAB4C0', fontSize: 13, flex: 1 },
  waitBadge: { backgroundColor: 'rgba(251,191,36,0.14)', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, alignSelf: 'flex-start' }, waitBadgeText: { color: '#FBBF24', fontSize: 12, fontWeight: '800' },
  progress: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 46, marginVertical: 8 }, step: { alignItems: 'center', width: 74 },
  stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#151D25', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' }, stepDotActive: { backgroundColor: '#16C784', borderColor: '#16C784' },
  stepNumber: { color: '#707B87', fontWeight: '800' }, stepNumberActive: { color: '#fff' }, stepLabel: { color: '#707B87', fontSize: 12, fontWeight: '700', marginTop: 7 }, stepLabelActive: { color: '#F8FAFC' }, progressLine: { flex: 1, height: 2, marginTop: 14 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }, sectionNumber: { color: '#16C784', fontSize: 12, fontWeight: '900' }, sectionTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '800' },
  personRow: { minHeight: 66, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', padding: 11, gap: 11 }, personName: { fontSize: 15, fontWeight: '800' }, secondary: { fontSize: 12, marginTop: 4 }, meBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 }, meText: { fontSize: 12, fontWeight: '800' },
  searchBox: { minHeight: 54, borderWidth: 1, borderRadius: 8, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }, searchInput: { flex: 1, fontSize: 15, paddingVertical: 14 }, resultRow: { borderWidth: 1, borderRadius: 8, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 }, checkLabel: { color: '#F8FAFC', fontSize: 14, fontWeight: '700', lineHeight: 21 }, checkDetail: { color: '#AAB4C0', fontSize: 12, marginTop: 2 },
  conditions: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' }, condition: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, divider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.09)' }, conditionLabel: { color: '#AAB4C0', fontSize: 13, flex: 1 }, conditionValue: { color: '#F8FAFC', fontSize: 14, fontWeight: '800' },
  confirmTitle: { fontSize: 22, fontWeight: '900', marginTop: 8 }, confirmSub: { fontSize: 13, lineHeight: 20, marginTop: -8 }, review: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' }, reviewRow: { minHeight: 58, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 16 }, reviewLabel: { color: '#AAB4C0', fontSize: 13, width: 58 }, reviewValue: { color: '#F8FAFC', fontSize: 14, fontWeight: '800', flex: 1, textAlign: 'right' }, warnText: { color: '#FBBF24' },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(251,191,36,0.10)', borderRadius: 8, padding: 13 }, noticeText: { color: '#FBBF24', flex: 1, fontSize: 13, lineHeight: 19 }, agreements: { gap: 2 }, rulesLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', paddingVertical: 8 }, rulesLinkText: { fontSize: 13, fontWeight: '800' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 88, borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, footerLabel: { fontSize: 11 }, footerPrice: { fontSize: 18, fontWeight: '900', marginTop: 2, minWidth: 78 }, backButton: { width: 92 },
});
