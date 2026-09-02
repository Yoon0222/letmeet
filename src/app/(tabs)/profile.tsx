import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { Avatar } from '@/components/ui/avatar';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useI18n } from '@/contexts/i18n';
import { confirmDestructive } from '@/lib/confirm';
import { requestDuprDisconnect } from '@/lib/dupr';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime, playStyleLabel, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

const dark = {
  background: '#070A0D',
  surface: '#10161D',
  surfaceSoft: '#151D25',
  line: 'rgba(255,255,255,0.09)',
  text: '#F8FAFC',
  textSecondary: '#AAB4C0',
  textMuted: '#707B87',
};

export default function ProfileScreen() {
  const router = useRouter();
  const { t, language, languages, languageLabels, setLanguage } = useI18n();
  const { session, profile, signOut, deleteAccount, refreshProfile } = useAuth();
  const [myMeetups, setMyMeetups] = useState<MeetupWithCounts[]>([]);
  const [reviewStat, setReviewStat] = useState<{ avg: number; count: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;

    const { data: rs } = await supabase.from('player_review_stats').select('*').eq('reviewee_id', uid).maybeSingle();
    setReviewStat(rs ? { avg: rs.avg_rating ?? 0, count: rs.review_count } : null);

    const { data: parts } = await supabase
      .from('meetup_participants')
      .select('meetup_id')
      .eq('user_id', uid)
      .eq('status', 'approved');

    const ids = (parts ?? []).map((p) => p.meetup_id);
    if (ids.length === 0) {
      setMyMeetups([]);
      return;
    }

    const { data } = await supabase
      .from('meetups_with_counts')
      .select('*')
      .in('id', ids)
      .order('start_time', { ascending: true });
    setMyMeetups(data ?? []);
  }, [session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const duprConnected = profile?.dupr_status === 'verified';
  const rating = profile?.dupr_rating ?? profile?.skill_level ?? 3;
  const ratingLabel = duprConnected ? 'DUPR Rating' : 'P!NUT Level';
  const recentMeetup = useMemo(() => myMeetups[0] ?? null, [myMeetups]);
  const needsSetup = profile && !profile.region;

  function confirmSignOut() {
    confirmDestructive(t('profile.signOutTitle'), t('profile.signOutBody'), t('profile.signOut'), () => signOut());
  }

  async function doDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (e) {
      Alert.alert(t('profile.deleteFailed'), e instanceof Error ? e.message : t('auth.errors.fallback'));
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete() {
    confirmDestructive(t('profile.deleteTitle'), t('profile.deleteBody'), t('profile.deleteAccount'), doDelete);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            {router.canGoBack() ? (
              <Pressable onPress={() => router.back()} hitSlop={8} style={styles.iconButton} accessibilityLabel="뒤로" accessibilityRole="button">
                <Ionicons name="chevron-back" size={18} color={dark.text} />
              </Pressable>
            ) : null}
            <Text style={styles.logo}>
              P!<Text style={styles.logoAccent}>NUT</Text>
            </Text>
          </View>
          <View style={styles.topActions}>
            <Pressable style={styles.iconButton} onPress={() => router.push('/profile/edit')} hitSlop={8}>
              <Ionicons name="create-outline" size={18} color={dark.text} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={() => router.push('/profile/connections')} hitSlop={8}>
              <Ionicons name="link-outline" size={18} color={dark.text} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileShell}>
          <View style={styles.profileHeader}>
            <Text style={styles.eyebrow}>{t('profile.title')}</Text>
            <View style={[styles.verifiedBadge, !profile?.dupr_verified && styles.neutralBadge]}>
              <Text style={[styles.verifiedText, !profile?.dupr_verified && styles.neutralBadgeText]}>
                {profile?.dupr_verified ? 'DUPR Verified' : 'DUPR Pending'}
              </Text>
            </View>
          </View>

          <View style={styles.playerRow}>
            <Avatar nickname={profile?.nickname ?? 'P!NUT'} uri={profile?.avatar_url} size={72} />
            <View style={{ flex: 1 }}>
              <Text style={styles.playerName} numberOfLines={1}>
                {profile?.nickname ?? 'P!NUT Player'}
              </Text>
              <Text style={styles.playerMeta} numberOfLines={1}>
                {profile?.region || '지역 미설정'} · {playStyleLabel(profile?.play_style ?? 'all')}
              </Text>
            </View>
          </View>

          <View style={styles.ratingCard}>
            <Text style={styles.ratingLabel}>{ratingLabel}</Text>
            {duprConnected ? (
              // 복식/단식 레이팅 구분 표시 — 미채점(NR)도 명시
              <View style={styles.ratingCols}>
                <View style={styles.ratingCol}>
                  <Text style={styles.ratingColLabel}>복식</Text>
                  <Text style={styles.ratingValue}>
                    {profile?.dupr_doubles != null ? profile.dupr_doubles.toFixed(2) : 'NR'}
                  </Text>
                </View>
                <View style={styles.ratingColDivider} />
                <View style={styles.ratingCol}>
                  <Text style={styles.ratingColLabel}>단식</Text>
                  <Text style={styles.ratingValue}>
                    {profile?.dupr_singles != null ? profile.dupr_singles.toFixed(2) : 'NR'}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.ratingRow}>
                <Text style={styles.ratingValue}>{rating.toFixed(2)}</Text>
                <Text style={[styles.ratingDelta, styles.ratingDeltaMuted]}>Self rated</Text>
              </View>
            )}
            <Text style={styles.ratingUpdated}>
              {duprConnected && profile?.dupr_synced_at ? `Updated ${profile.dupr_synced_at.slice(0, 10)}` : skillLabel(profile?.skill_level ?? 3)}
            </Text>
            {/* DUPR 자격(엔티틀먼트) — 연결과 별개로 SSO 에서 동기화되는 멤버십 자격 (0061·0084) */}
            {profile?.dupr_status === 'verified' ? (
              <>
                <View style={styles.entRow}>
                  <EntChip label="BASIC" active={!!profile.dupr_basic} />
                  <EntChip label="DUPR+" active={!!profile.dupr_premium} tone="purple" />
                  <EntChip label="VERIFIED" active={!!profile.dupr_verified_l1} tone="purple" />
                </View>
                {!profile.dupr_basic ? (
                  <Pressable onPress={() => router.push('/dupr-connect' as never)} style={styles.entWarn}>
                    <Ionicons name="alert-circle-outline" size={14} color="#F59E0B" />
                    <Text style={styles.entWarnText}>자격 확인이 안 됐어요 — DUPR 재연결로 갱신하기</Text>
                    <Ionicons name="chevron-forward" size={14} color="#F59E0B" />
                  </Pressable>
                ) : null}
                {/* DUPR 연결 해제 — 구독·토큰·히스토리까지 정리(동의 철회) */}
                <Pressable
                  onPress={() =>
                    confirmDestructive(
                      'DUPR 연결 해제',
                      '레이팅 표시·자격·기록 그래프가 제거되고, 피넛의 DUPR 데이터 접근(토큰·알림 구독)이 모두 폐기돼요.\n\n다만 DUPR 계정 설정의 "연동된 앱" 목록은 DUPR(mydupr.com) 설정에서 직접 해제해야 지워져요. 언제든 다시 연결할 수 있어요.',
                      '해제',
                      async () => {
                        const res = await requestDuprDisconnect();
                        if (!res.ok) {
                          Alert.alert('해제 실패', res.error ?? '잠시 후 다시 시도해 주세요.');
                          return;
                        }
                        await refreshProfile();
                      },
                    )
                  }
                  style={styles.duprUnlink}
                  hitSlop={6}>
                  <Text style={styles.duprUnlinkText}>DUPR 연결 해제</Text>
                </Pressable>
              </>
            ) : null}
          </View>

          <View style={styles.quickGrid}>
            <QuickAction icon="analytics-outline" label="경기 기록" onPress={() => router.push(`/player/${session?.user.id}` as never)} />
            <QuickAction icon="bar-chart-outline" label="통계" onPress={() => router.push(`/player/${session?.user.id}` as never)} />
            <QuickAction icon="trophy-outline" label="랭킹" onPress={() => router.push('/tournaments' as never)} />
            <QuickAction icon="shield-checkmark-outline" label="뱃지" onPress={() => router.push('/profile/edit')} />
          </View>
        </View>

        {needsSetup ? (
          <Pressable onPress={() => router.push('/profile/edit')} style={styles.setupBanner}>
            <Ionicons name="information-circle-outline" size={20} color={Brand.primary} />
            <Text style={styles.setupText}>{t('profile.completeProfile')}</Text>
            <Ionicons name="chevron-forward" size={18} color={dark.textMuted} />
          </Pressable>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>최근 활동</Text>
          <Pressable onPress={() => router.push(`/player/${session?.user.id}` as never)} hitSlop={8}>
            <Text style={styles.moreText}>더보기</Text>
          </Pressable>
        </View>

        <RecentActivityCard meetup={recentMeetup} reviewStat={reviewStat} />

        <View style={styles.languagePanel}>
          <View style={{ flex: 1 }}>
            <Text style={styles.panelTitle}>{t('profile.language')}</Text>
            <Text style={styles.panelHint}>{t('profile.languageHint')}</Text>
          </View>
          <View style={styles.languageOptions}>
            {languages.map((item) => {
              const active = item === language;
              return (
                <Pressable
                  key={item}
                  onPress={() => setLanguage(item)}
                  style={[styles.languageButton, active && styles.languageButtonActive]}>
                  <Text style={[styles.languageText, active && styles.languageTextActive]}>{languageLabels[item]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('profile.myMeetups')}</Text>
          <Text style={styles.countText}>{myMeetups.length}개</Text>
        </View>

        {myMeetups.length === 0 ? (
          <View style={styles.emptyPanel}>
            <Ionicons name="calendar-clear-outline" size={24} color={dark.textMuted} />
            <Text style={styles.emptyText}>{t('profile.emptyMeetups')}</Text>
          </View>
        ) : (
          <View style={{ gap: Spacing.three }}>
            {myMeetups.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        )}

        <Pressable onPress={confirmSignOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
        </Pressable>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Pressable onPress={confirmDelete} disabled={deleting} hitSlop={8} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>{deleting ? t('profile.deleting') : t('profile.deleteAccount')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// DUPR 자격 칩 — active=보유(체크), 아니면 회색 (0061·0084)
function EntChip({ label, active, tone }: { label: string; active: boolean; tone?: 'purple' }) {
  const color = active ? (tone === 'purple' ? '#8B5CF6' : '#16C784') : dark.textMuted;
  const bg = active ? (tone === 'purple' ? 'rgba(139,92,246,0.14)' : 'rgba(22,199,132,0.12)') : 'rgba(255,255,255,0.06)';
  return (
    <View style={[styles.entChip, { backgroundColor: bg }]}>
      <Ionicons name={active ? 'checkmark-circle' : 'remove-circle-outline'} size={13} color={color} />
      <Text style={[styles.entChipText, { color }]}>{label}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <Ionicons name={icon} size={20} color={dark.textSecondary} />
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

function RecentActivityCard({
  meetup,
  reviewStat,
}: {
  meetup: MeetupWithCounts | null;
  reviewStat: { avg: number; count: number } | null;
}) {
  if (!meetup) {
    return (
      <View style={styles.recentCard}>
        <View style={styles.emptyRecentIcon}>
          <Ionicons name="flash-outline" size={22} color={Brand.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.recentTitle}>아직 최근 활동이 없어요</Text>
          <Text style={styles.recentSub}>번개 모임에 참여하면 이곳에 기록처럼 쌓입니다.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.recentCard}>
      <Text style={styles.recentDate}>{formatMeetupTime(meetup.start_time)}</Text>
      <View style={styles.matchRow}>
        <View style={styles.duoAvatars}>
          <Avatar nickname={meetup.host_nickname} uri={meetup.host_avatar_url} size={34} />
          <View style={styles.avatarOverlap}>
            <Avatar nickname="P!NUT" size={34} />
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.recentTitle} numberOfLines={1}>
            {meetup.title}
          </Text>
          <Text style={styles.recentSub} numberOfLines={1}>
            {meetup.location_name} · {meetup.participant_count}/{meetup.max_players}
          </Text>
        </View>
        <View style={styles.winBlock}>
          <Text style={styles.winText}>READY</Text>
          <Text style={styles.scoreText}>{reviewStat ? `★ ${reviewStat.avg.toFixed(1)}` : '11 - ?'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: dark.background },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, gap: Spacing.three, paddingBottom: 124 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { fontSize: 20, fontWeight: '900', color: dark.text, letterSpacing: 0 },
  logoAccent: { color: Brand.primary },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: dark.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileShell: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.line,
  },
  profileHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { fontSize: 13, fontWeight: '800', color: dark.textSecondary },
  verifiedBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.16)',
  },
  neutralBadge: { backgroundColor: 'rgba(255,255,255,0.08)' },
  verifiedText: { fontSize: 11, fontWeight: '900', color: Brand.primary },
  neutralBadgeText: { color: dark.textMuted },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  playerName: { fontSize: 24, fontWeight: '900', color: dark.text },
  playerMeta: { marginTop: 4, fontSize: 13, fontWeight: '600', color: dark.textSecondary },
  ratingCard: {
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: dark.line,
  },
  ratingLabel: { fontSize: 13, fontWeight: '700', color: dark.textSecondary },
  ratingRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.one, marginTop: 8 },
  ratingValue: { fontSize: 52, lineHeight: 58, fontWeight: '900', color: dark.text, fontVariant: ['tabular-nums'] },
  ratingDelta: { paddingBottom: 8, fontSize: 15, fontWeight: '900', color: '#9BE137' },
  ratingDeltaMuted: { color: dark.textMuted },
  ratingUpdated: { marginTop: 6, fontSize: 12, fontWeight: '600', color: dark.textMuted },
  ratingCols: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: Spacing.four },
  ratingCol: { alignItems: 'center', minWidth: 108 },
  ratingColLabel: { fontSize: 12.5, fontWeight: '800', color: dark.textSecondary, marginBottom: 2 },
  ratingColDivider: { width: 1, height: 44, backgroundColor: dark.line },
  entRow: { flexDirection: 'row', gap: 6, marginTop: 12, justifyContent: 'center' },
  entChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderCurve: 'continuous' },
  entChipText: { fontSize: 11.5, fontWeight: '800' },
  entWarn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  entWarnText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  duprUnlink: { marginTop: 10, alignSelf: 'center' },
  duprUnlinkText: { fontSize: 12, fontWeight: '700', color: '#707B87', textDecorationLine: 'underline' },
  quickGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: dark.line,
    paddingTop: Spacing.three,
  },
  quickAction: { flex: 1, alignItems: 'center', gap: 7 },
  quickLabel: { fontSize: 12, fontWeight: '700', color: dark.textSecondary },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.three,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: dark.surfaceSoft,
    borderWidth: 1,
    borderColor: dark.line,
  },
  setupText: { flex: 1, fontSize: 13, fontWeight: '700', color: dark.text },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: dark.text },
  moreText: { fontSize: 13, fontWeight: '800', color: dark.textMuted },
  countText: { fontSize: 13, fontWeight: '800', color: dark.textMuted },
  recentCard: {
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.line,
  },
  recentDate: { fontSize: 12, fontWeight: '700', color: dark.textMuted },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  duoAvatars: { flexDirection: 'row', width: 60 },
  avatarOverlap: { marginLeft: -12 },
  recentTitle: { fontSize: 16, fontWeight: '900', color: dark.text },
  recentSub: { marginTop: 4, fontSize: 12, lineHeight: 18, color: dark.textSecondary },
  winBlock: { alignItems: 'flex-end' },
  winText: { fontSize: 13, fontWeight: '900', color: '#9BE137' },
  scoreText: { marginTop: 4, fontSize: 16, fontWeight: '900', color: dark.text },
  emptyRecentIcon: {
    width: 44,
    height: 44,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(22,199,132,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languagePanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: dark.surfaceSoft,
    borderWidth: 1,
    borderColor: dark.line,
  },
  panelTitle: { fontSize: 16, fontWeight: '900', color: dark.text },
  panelHint: { marginTop: 4, fontSize: 12, color: dark.textSecondary },
  languageOptions: { flexDirection: 'row', gap: 8 },
  languageButton: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButtonActive: { backgroundColor: Brand.primary },
  languageText: { fontSize: 12, fontWeight: '900', color: dark.textSecondary },
  languageTextActive: { color: '#FFFFFF' },
  emptyPanel: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: dark.surface,
    borderWidth: 1,
    borderColor: dark.line,
  },
  emptyText: { fontSize: 14, lineHeight: 20, color: dark.textSecondary, textAlign: 'center' },
  signOutButton: {
    height: 56,
    marginTop: Spacing.three,
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: dark.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  signOutText: { fontSize: 16, fontWeight: '800', color: dark.text },
  email: { fontSize: 13, textAlign: 'center', marginTop: Spacing.one, color: dark.textMuted },
  deleteBtn: { alignSelf: 'center', marginTop: Spacing.one, padding: 8 },
  deleteText: { fontSize: 13, fontWeight: '700', color: '#F87171', textDecorationLine: 'underline' },
});
