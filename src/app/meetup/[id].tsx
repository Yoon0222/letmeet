import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppAlert as Alert } from '@/lib/feedback';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportBlock } from '@/components/report-block';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMeetupTime, skillLabel, skillRangeLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts, ParticipantWithProfile } from '@/lib/types';

export default function MeetupDetail() {
  const router = useRouter();
  const navigation = useNavigation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useAuth();
  const uid = session?.user.id;
  const duprConnected = profile?.dupr_status === 'verified';
  const duprEligible = duprConnected && !!profile?.dupr_basic; // 연결 + BASIC_L1(active)
  const duprPlus = duprConnected && !!profile?.dupr_premium && !!profile?.dupr_verified_l1; // DUPR+ = PREMIUM_L1 + VERIFIED_L1 (0084)

  const [meetup, setMeetup] = useState<MeetupWithCounts | null>(null);
  const [participants, setParticipants] = useState<ParticipantWithProfile[]>([]);
  const [reviewStats, setReviewStats] = useState<Record<string, { avg: number; count: number }>>({});
  const [courtImage, setCourtImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase.from('meetups_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region, dupr_rating, dupr_verified)')
        .eq('meetup_id', id)
        .order('joined_at', { ascending: true }),
    ]);
    setMeetup(m ?? null);
    if (m?.court_id) {
      const { data: court } = await supabase.from('courts').select('images, image_url').eq('id', m.court_id).maybeSingle();
      setCourtImage(court?.images?.[0] ?? court?.image_url ?? null);
    } else {
      setCourtImage(null);
    }
    const list = (p as unknown as ParticipantWithProfile[]) ?? [];
    setParticipants(list);
    // 참가자·신청자의 리뷰 요약(평균·개수) — 승인 판단에 노출
    const ids = list.map((x) => x.user_id);
    if (ids.length > 0) {
      const { data: st } = await supabase.from('player_review_stats').select('*').in('reviewee_id', ids);
      const map: Record<string, { avg: number; count: number }> = {};
      (st ?? []).forEach((s) => {
        map[s.reviewee_id] = { avg: s.avg_rating ?? 0, count: s.review_count };
      });
      setReviewStats(map);
    } else {
      setReviewStats({});
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // load 는 비동기로 await 이후 setState 를 호출하므로 동기 cascading 렌더가 아니다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isHost = meetup?.host_id === uid;
  const approved = participants.filter((p) => p.status === 'approved');
  const pending = participants.filter((p) => p.status === 'pending');
  const myPart = participants.find((p) => p.user_id === uid);
  const isApproved = myPart?.status === 'approved';
  const isPending = myPart?.status === 'pending';
  const full = !!meetup && meetup.participant_count >= meetup.max_players;
  const closed = meetup?.status !== 'open';
  const participantProgress = meetup ? Math.min(100, Math.max(0, (meetup.participant_count / meetup.max_players) * 100)) : 0;
  const remainingSpots = meetup ? Math.max(0, meetup.max_players - meetup.participant_count) : 0;

  useEffect(() => {
    navigation.setOptions({
      title: '모임 상세',
      headerRight:
        meetup && !isHost
          ? () => <ReportBlock targetType="meetup" targetId={meetup.id} targetUserId={meetup.host_id} targetLabel={meetup.title} onBlocked={() => router.back()} />
          : undefined,
    });
  }, [navigation, meetup, isHost, router]);

  async function join() {
    if (!uid) {
      router.push('/(auth)/sign-in');
      return;
    }
    if (!id || !meetup) return;
    setActing(true);
    // 승인제면 pending, 아니면 바로 approved
    const { error } = await supabase
      .from('meetup_participants')
      .insert({ meetup_id: id, user_id: uid, status: meetup.require_approval ? 'pending' : 'approved' });
    setActing(false);
    if (error) {
      Alert.alert('참가 실패', error.message);
      return;
    }
    if (meetup.require_approval) Alert.alert('참가 신청 완료', '호스트 승인 후 참가가 확정돼요.');
    load();
  }

  // 참가 전 게스트비·승인 여부 확인
  function confirmJoin() {
    if (!meetup) return;
    if (!uid) {
      router.push('/(auth)/sign-in');
      return;
    }
    // DUPR+ 전용 번개는 PREMIUM_L1 + VERIFIED_L1 보유자만 참가 (0084)
    if (meetup.dupr_premium && !duprPlus) {
      if (!duprConnected) {
        Alert.alert(
          'DUPR+ 전용 모임이에요',
          '이 모임은 DUPR+ 회원(PREMIUM + VERIFIED)만 참가할 수 있어요. 먼저 DUPR 계정을 연결해 주세요.',
          [
            { text: '나중에', style: 'cancel' },
            { text: 'DUPR 연결하기', onPress: () => router.push('/dupr-connect' as never) },
          ],
        );
      } else {
        Alert.alert('DUPR+ 자격 필요', 'DUPR+ 전용 모임은 PREMIUM 구독과 VERIFIED 자격이 모두 필요해요. DUPR 앱에서 구독·인증 상태를 확인해 주세요.');
      }
      return;
    }
    // DUPR 인증 번개는 연결(verified) + BASIC_L1(활성 회원)만 참가 가능
    if (meetup.dupr_certified && !duprEligible) {
      if (duprConnected && !profile?.dupr_basic) {
        Alert.alert('DUPR 자격 필요', 'DUPR 계정이 활성(BASIC) 상태가 아니에요. DUPR 앱에서 계정 상태를 확인한 뒤 다시 시도해 주세요.');
        return;
      }
      Alert.alert(
        'DUPR 인증이 필요해요',
        'DUPR 인증 번개는 DUPR 계정을 연결한 회원만 참가할 수 있어요. 경기 결과가 DUPR 공식 레이팅에 반영됩니다.\n\n지금 바로 연결할까요? (DUPR 계정이 없으면 가입도 가능해요)',
        [
          { text: '나중에', style: 'cancel' },
          { text: 'DUPR 연결하기', onPress: () => router.push('/dupr-connect' as never) },
        ],
      );
      return;
    }
    const feeLine = meetup.fee > 0 ? `게스트비: ${meetup.fee.toLocaleString()}원\n` : '게스트비: 무료\n';
    const tailLine = meetup.require_approval ? '호스트 승인 후 참가가 확정됩니다.' : '이 모임에 참가할까요?';
    Alert.alert(meetup.require_approval ? '참가 신청' : '참가하기', `${feeLine}${tailLine}`, [
      { text: '닫기', style: 'cancel' },
      { text: meetup.require_approval ? '신청' : '참가', onPress: join },
    ]);
  }

  // 호스트: 참가 신청 승인/거절
  async function approve(userId: string) {
    if (!id) return;
    await supabase.from('meetup_participants').update({ status: 'approved' }).eq('meetup_id', id).eq('user_id', userId);
    load();
  }
  async function reject(userId: string) {
    if (!id) return;
    await supabase.from('meetup_participants').delete().eq('meetup_id', id).eq('user_id', userId);
    load();
  }

  async function leave() {
    if (!uid || !id) return;
    setActing(true);
    const { error } = await supabase
      .from('meetup_participants')
      .delete()
      .eq('meetup_id', id)
      .eq('user_id', uid);
    setActing(false);
    if (error) {
      Alert.alert('취소 실패', error.message);
      return;
    }
    load();
  }

  function confirmLeave() {
    Alert.alert(
      isPending ? '신청 취소' : '참가 취소',
      isPending ? '참가 신청을 취소할까요?' : '이 모임 참가를 취소할까요?',
      [
        { text: '닫기', style: 'cancel' },
        { text: isPending ? '신청 취소' : '참가 취소', style: 'destructive', onPress: leave },
      ],
    );
  }

  function confirmCancelMeetup() {
    Alert.alert('모임 취소', '모임을 취소하면 되돌릴 수 없어요. 진행할까요?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '모임 취소',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', id);
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  if (!meetup) {
    return (
      <View style={styles.center}>
        <Text style={styles.notFound}>모임을 찾을 수 없어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          {closed ? <Badge label={meetup.status === 'cancelled' ? '취소된 모임' : '마감된 모임'} color="#E5484D" bg="rgba(229,72,77,0.14)" /> : full ? <Badge label="정원 마감" color="#F5A623" bg="rgba(245,166,35,0.16)" /> : <Badge label="모집중" />}
          {meetup.discipline !== 'any' ? <Badge label={meetup.discipline === 'doubles' ? '복식' : '단식'} color="#0EA5E9" bg="rgba(14,165,233,0.12)" /> : null}
          {meetup.dupr_certified ? <Badge label="DUPR 인증" color="#2D6BD6" bg="rgba(45,107,214,0.12)" /> : null}
          {meetup.dupr_premium ? <Badge label="DUPR+ 전용" color="#8B5CF6" bg="rgba(139,92,246,0.14)" /> : null}
        </View>

        <Text style={styles.title}>{meetup.title}</Text>

        <Image
          source={courtImage ? { uri: courtImage } : require('@/assets/images/icon.png')}
          style={[styles.cover, !courtImage && styles.coverFallback]}
          resizeMode={courtImage ? 'cover' : 'contain'}
        />

        <View style={styles.primaryInfo}>
          <View style={styles.primaryRow}><Ionicons name="calendar-outline" size={23} color="#F8FAFC" /><Text style={styles.primaryText}>{formatMeetupTime(meetup.start_time)}</Text></View>
          <View style={styles.primaryRow}><Ionicons name="location-outline" size={23} color="#F8FAFC" /><Text style={styles.primaryText}>{meetup.location_name}{meetup.region ? ` · ${meetup.region}` : ''}</Text></View>
        </View>

        <View style={styles.capacitySection}>
          <View style={styles.capacityTop}><Text style={styles.capacityTitle}>참가 {meetup.participant_count} / {meetup.max_players}명</Text><Text style={styles.remaining}>{full ? '정원이 마감됐어요' : `${remainingSpots}자리 남았어요`}</Text></View>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${participantProgress}%` }]} /></View>
        </View>

        {/* DUPR 인증 번개 안내 + (호스트) 경기 기록 진입 */}
        {meetup.dupr_certified ? (
          <Pressable
            onPress={() => isHost && router.push(`/meetup/record/${meetup.id}` as never)}
            disabled={!isHost}
            style={styles.duprBanner}>
            <Ionicons name="stats-chart" size={18} color="#2D6BD6" />
            <View style={{ flex: 1 }}>
              <Text style={styles.duprBannerTitle}>DUPR 인증 경기</Text>
              <Text style={styles.duprBannerSub}>
                {isHost ? '경기 결과를 기록하면 DUPR 공식 레이팅에 반영돼요.' : '연결된 회원만 참가 · 결과가 DUPR에 반영돼요.'}
              </Text>
            </View>
            {isHost ? <Ionicons name="chevron-forward" size={18} color="#2D6BD6" /> : null}
          </Pressable>
        ) : null}

        <View style={styles.factsGrid}>
          <FactCell icon="hourglass-outline" text={`약 ${Math.round(meetup.duration_min / 60 * 10) / 10}시간`} />
          <FactCell icon="stats-chart-outline" text={skillRangeLabel(meetup.skill_min, meetup.skill_max)} />
          <FactCell icon="cash-outline" text={meetup.fee > 0 ? `게스트비 ${meetup.fee.toLocaleString()}원` : '게스트비 무료'} />
          <FactCell icon="people-outline" text={meetup.require_approval ? '호스트 승인제' : '바로 참가'} />
        </View>

        {meetup.description ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>모임 소개</Text>
            <Text style={styles.desc}>{meetup.description}</Text>
          </View>
        ) : null}

        {/* 호스트: 참가 신청 대기 목록 */}
        {isHost && pending.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>참가 신청 {pending.length}명</Text>
            <Text style={styles.sectionHint}>신청자를 눌러 리뷰·DUPR을 확인한 뒤 승인하세요.</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {pending.map((p) => {
                const st = reviewStats[p.user_id];
                const duprPart =
                  p.profiles?.dupr_rating != null
                    ? `DUPR ${p.profiles.dupr_rating.toFixed(1)}`
                    : `실력 ${p.profiles?.skill_level.toFixed(1) ?? '-'}`;
                const reviewPart = st ? `★ ${st.avg.toFixed(1)} (${st.count})` : '리뷰 없음';
                return (
                  <View key={p.user_id} style={styles.pRow}>
                    <Pressable style={styles.pInfo} onPress={() => router.push(`/player/${p.user_id}` as never)}>
                      <Avatar nickname={p.profiles?.nickname ?? '?'} uri={p.profiles?.avatar_url} size={40} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pName}>{p.profiles?.nickname ?? '알 수 없음'}</Text>
                        <Text style={styles.pMeta}>{duprPart} · {reviewPart}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#707B87" />
                    </Pressable>
                    <Text onPress={() => approve(p.user_id)} style={styles.approveBtn}>승인</Text>
                    <Text onPress={() => reject(p.user_id)} style={styles.rejectBtn}>거절</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>참가자 {approved.length}명</Text>
          <View style={{ gap: 10, marginTop: 8 }}>
            {approved.map((p) => (
              <Pressable key={p.user_id} style={styles.pRow} onPress={() => router.push(`/player/${p.user_id}` as never)}>
                <Avatar nickname={p.profiles?.nickname ?? '?'} uri={p.profiles?.avatar_url} size={40} />
                <View style={{ flex: 1 }}>
                  <View style={styles.pNameRow}>
                    <Text style={styles.pName}>{p.profiles?.nickname ?? '알 수 없음'}</Text>
                    {p.user_id === meetup.host_id && <Badge label="호스트" color="#2D7FF9" bg="rgba(45,127,249,0.14)" />}
                  </View>
                  <Text style={styles.pMeta}>{p.profiles?.region || '지역 미설정'}</Text>
                </View>
                <Text style={styles.pSkill}>
                  {p.profiles ? `${p.profiles.skill_level.toFixed(1)} ${skillLabel(p.profiles.skill_level)}` : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        {!isHost && !closed && !isApproved && !isPending ? (
          <View style={styles.joinSummary}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#16C784" />
            <Text style={styles.joinSummaryText}>{meetup.fee > 0 ? `게스트비 ${meetup.fee.toLocaleString()}원` : '게스트비 무료'}{meetup.require_approval ? ' · 호스트 승인 후 확정' : ''}</Text>
          </View>
        ) : null}
        {isHost ? (
          !closed ? (
            <Button title="모임 취소하기" variant="danger" onPress={confirmCancelMeetup} />
          ) : (
            <Button title="종료된 모임입니다" variant="secondary" disabled onPress={() => {}} />
          )
        ) : closed ? (
          <Button title="참가할 수 없는 모임입니다" variant="secondary" disabled onPress={() => {}} />
        ) : isPending ? (
          <Button title="참가 신청 취소 (승인 대기 중)" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : isApproved ? (
          <Button title="참가 취소" variant="outline" onPress={confirmLeave} loading={acting} />
        ) : (
          <Button
            title={full ? '정원이 가득 찼어요' : meetup.require_approval ? '참가 신청하기' : '참가하기'}
            onPress={confirmJoin}
            disabled={full}
            loading={acting}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function FactCell({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.factCell}>
      <Ionicons name={icon} size={21} color="#16C784" />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  notFound: { color: '#AAB4C0', fontSize: 15 },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  cover: { width: '100%', height: 190, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#151D25' },
  coverFallback: { backgroundColor: '#070A0D' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  title: { fontSize: 28, fontWeight: '900', color: '#F8FAFC' },
  primaryInfo: { gap: 12, paddingVertical: 2 },
  primaryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  primaryText: { flex: 1, color: '#F8FAFC', fontSize: 17, fontWeight: '700' },
  capacitySection: { gap: 10, paddingVertical: Spacing.three, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  capacityTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  capacityTitle: { color: '#F8FAFC', fontSize: 17, fontWeight: '900' },
  remaining: { color: '#16C784', fontSize: 14, fontWeight: '800' },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: '#1B242D', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#16C784' },
  duprBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.three,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(45,107,214,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(45,107,214,0.18)',
  },
  duprBannerTitle: { fontSize: 15, fontWeight: '800', color: '#2D6BD6' },
  duprBannerSub: { fontSize: 12.5, color: '#AAB4C0', marginTop: 2, lineHeight: 17 },
  infoCard: {
    backgroundColor: '#10161D',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 12,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '500', color: '#F8FAFC', flex: 1 },
  factsGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderLeftWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  factCell: { width: '50%', minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRightWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  factText: { flex: 1, color: '#F8FAFC', fontSize: 14, fontWeight: '700' },
  section: { marginTop: Spacing.two },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#F8FAFC' },
  sectionHint: { fontSize: 13, color: '#707B87', marginTop: 2 },
  desc: { fontSize: 15, lineHeight: 22, color: '#AAB4C0', marginTop: 6 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  pNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pName: { fontSize: 15, fontWeight: '700', color: '#F8FAFC' },
  pMeta: { fontSize: 13, color: '#AAB4C0', marginTop: 1 },
  pSkill: { fontSize: 13, fontWeight: '700', color: '#16C784' },
  approveBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#16C784',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  rejectBtn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#AAB4C0',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  actionBar: { padding: Spacing.three, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)', backgroundColor: '#070A0D' },
  joinSummary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  joinSummaryText: { color: '#D7DCE2', fontSize: 13, fontWeight: '700' },
});
