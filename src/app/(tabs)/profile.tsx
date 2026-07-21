import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { ProfileSummaryCard } from '@/components/profile-summary-card';
import { AppCard } from '@/components/ui/app-card';
import { AppHeader } from '@/components/ui/app-header';
import { Button } from '@/components/ui/button';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useI18n } from '@/contexts/i18n';
import { confirmDestructive } from '@/lib/confirm';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

export default function ProfileScreen() {
  const router = useRouter();
  const { t, language, languages, languageLabels, setLanguage } = useI18n();
  const { session, profile, signOut, deleteAccount } = useAuth();
  const [myMeetups, setMyMeetups] = useState<MeetupWithCounts[]>([]);
  const [reviewStat, setReviewStat] = useState<{ avg: number; count: number } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;
    // 받은 리뷰 요약(평균·개수)
    const { data: rs } = await supabase.from('player_review_stats').select('*').eq('reviewee_id', uid).maybeSingle();
    setReviewStat(rs ? { avg: rs.avg_rating ?? 0, count: rs.review_count } : null);
    const { data: parts } = await supabase
      .from('meetup_participants')
      .select('meetup_id')
      .eq('user_id', uid)
      .eq('status', 'approved'); // 승인된(확정) 참가만
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

  function confirmSignOut() {
    confirmDestructive(
      t('profile.signOutTitle'),
      t('profile.signOutBody'),
      t('profile.signOut'),
      () => signOut(),
    );
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
    confirmDestructive(
      t('profile.deleteTitle'),
      t('profile.deleteBody'),
      t('profile.deleteAccount'),
      doDelete,
    );
  }

  const needsSetup = profile && !profile.region;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppHeader title={t('profile.title')} rightIcon="create-outline" onRightPress={() => router.push('/profile/edit')} />

        <ProfileSummaryCard profile={profile} meetupCount={myMeetups.length} />

        {/* 받은 리뷰 — 요약 + 탭하면 전체 리뷰(플레이어 화면) */}
        <AppCard onPress={() => router.push(`/player/${session?.user.id}` as never)} style={styles.reviewRow}>
          <View style={styles.reviewIcon}>
            <Ionicons name="star" size={18} color="#F5A623" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTitle}>받은 리뷰</Text>
            <Text style={styles.reviewSub}>
              {reviewStat ? `평균 ★ ${reviewStat.avg.toFixed(1)} · ${reviewStat.count}개` : '아직 받은 리뷰가 없어요'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </AppCard>

        {/* 연결된 로그인 관리 */}
        <AppCard onPress={() => router.push('/profile/connections')} style={styles.reviewRow}>
          <View style={[styles.reviewIcon, { backgroundColor: '#EAF1FF' }]}>
            <Ionicons name="link-outline" size={18} color="#2D6BD6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTitle}>연결된 로그인</Text>
            <Text style={styles.reviewSub}>이메일·구글 등 로그인 수단 관리</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </AppCard>

        <AppCard disabled style={styles.languageCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.languageTitle}>{t('profile.language')}</Text>
            <Text style={styles.languageHint}>{t('profile.languageHint')}</Text>
          </View>
          <View style={styles.languageOptions}>
            {languages.map((item) => {
              const active = item === language;
              return (
                <Pressable
                  key={item}
                  onPress={() => setLanguage(item)}
                  style={[styles.languageButton, active && styles.languageButtonActive]}>
                  <Text style={[styles.languageText, active && styles.languageTextActive]}>
                    {languageLabels[item]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AppCard>

        {needsSetup && (
          <Pressable onPress={() => router.push('/profile/edit')} style={styles.setupBanner}>
            <Ionicons name="information-circle-outline" size={20} color="#16C784" />
            <Text style={styles.setupText}>{t('profile.completeProfile')}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </Pressable>
        )}

        <Text style={styles.sectionTitle}>{t('profile.myMeetups')}</Text>
        {myMeetups.length === 0 ? (
          <Text style={styles.emptyMeetup}>{t('profile.emptyMeetups')}</Text>
        ) : (
          <View style={{ gap: Spacing.three }}>
            {myMeetups.map((m) => (
              <MeetupCard key={m.id} meetup={m} onPress={() => router.push(`/meetup/${m.id}`)} />
            ))}
          </View>
        )}

        <Button title={t('profile.signOut')} variant="outline" onPress={confirmSignOut} style={{ marginTop: Spacing.four }} />
        <Text style={styles.email}>{session?.user.email}</Text>
        <Pressable onPress={confirmDelete} disabled={deleting} hitSlop={8} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>{deleting ? t('profile.deleting') : t('profile.deleteAccount')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 60 },
  reviewRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  reviewIcon: { width: 40, height: 40, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  reviewSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  languageTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  languageHint: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  languageOptions: { flexDirection: 'row', gap: 8 },
  languageButton: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F6F7F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageButtonActive: { backgroundColor: '#16C784' },
  languageText: { fontSize: 13, fontWeight: '800', color: '#6B7280' },
  languageTextActive: { color: '#FFFFFF' },
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.three,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  setupText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827' },
  sectionTitle: { fontSize: 26, fontWeight: '800', color: '#111827', marginTop: Spacing.three },
  emptyMeetup: { fontSize: 16, lineHeight: 22, color: '#6B7280' },
  email: { fontSize: 13, textAlign: 'center', marginTop: Spacing.three, color: '#9CA3AF' },
  deleteBtn: { alignSelf: 'center', marginTop: Spacing.three, padding: 8 },
  deleteText: { fontSize: 13, fontWeight: '600', color: Brand.danger, textDecorationLine: 'underline' },
});
