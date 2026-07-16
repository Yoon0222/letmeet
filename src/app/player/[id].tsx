import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMeetupTime, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { PlayerReviewWithReviewer, Profile } from '@/lib/types';

// 별점 표시(읽기) — rating(0~5)만큼 채움
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= full ? 'star' : 'star-outline'} size={size} color="#F5A623" />
      ))}
    </View>
  );
}

export default function PlayerProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<PlayerReviewWithReviewer[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);

  const [composerOpen, setComposerOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: p }, { data: rv }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('player_reviews_with_reviewer').select('*').eq('reviewee_id', id).order('updated_at', { ascending: false }),
    ]);
    setProfile((p as Profile) ?? null);
    const list = (rv as PlayerReviewWithReviewer[]) ?? [];
    setReviews(list);
    // 내 기존 리뷰가 있으면 프리필
    const mine = list.find((r) => r.reviewer_id === uid);
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment);
    }
    // 리뷰 자격: 로그인 + 타인 + 함께 친 이력
    if (uid && uid !== id) {
      const { data: ok } = await supabase.rpc('have_played_together', { a: uid, b: id });
      setCanReview(!!ok);
    } else {
      setCanReview(false);
    }
    setLoading(false);
  }, [id, uid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const myReview = reviews.find((r) => r.reviewer_id === uid);
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  async function submitReview() {
    if (!uid || !id) return;
    setSaving(true);
    const { error } = await supabase
      .from('player_reviews')
      .upsert(
        { reviewer_id: uid, reviewee_id: id, rating, comment: comment.trim(), updated_at: new Date().toISOString() },
        { onConflict: 'reviewer_id,reviewee_id' },
      );
    setSaving(false);
    if (error) {
      Alert.alert('리뷰 저장 실패', error.message);
      return;
    }
    setComposerOpen(false);
    load();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}><ActivityIndicator color="#16C784" /></View>
      </SafeAreaView>
    );
  }
  if (!profile) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}><Text style={styles.muted}>플레이어를 찾을 수 없어요.</Text></View>
      </SafeAreaView>
    );
  }

  const duprText =
    profile.dupr_rating != null
      ? `DUPR ${profile.dupr_rating.toFixed(1)}`
      : 'DUPR 미입력';

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* 프로필 헤더 */}
        <View style={styles.headerCard}>
          <Avatar nickname={profile.nickname} uri={profile.avatar_url} size={72} />
          <Text style={styles.name}>{profile.nickname}</Text>
          <Text style={styles.sub}>{profile.region || '지역 미설정'}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.chip}>
              <Ionicons name="ribbon-outline" size={14} color="#6B7280" />
              <Text style={styles.chipText}>실력 {profile.skill_level.toFixed(1)} {skillLabel(profile.skill_level)}</Text>
            </View>
            <View style={[styles.chip, profile.dupr_rating != null && styles.duprChip]}>
              <Ionicons name="stats-chart-outline" size={14} color={profile.dupr_rating != null ? '#2D6BD6' : '#9CA3AF'} />
              <Text style={[styles.chipText, profile.dupr_rating != null && { color: '#2D6BD6' }]}>{duprText}</Text>
              {profile.dupr_verified ? (
                <Badge label="인증" color="#0F8F5F" bg="#DCFCE7" />
              ) : profile.dupr_rating != null ? (
                <Text style={styles.selfInput}>자가입력</Text>
              ) : null}
            </View>
          </View>
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
        </View>

        {/* 리뷰 요약 */}
        <View style={styles.summaryCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>플레이어 리뷰</Text>
            <Text style={styles.summarySub}>함께 친 플레이어들의 평가예요.</Text>
          </View>
          {reviews.length > 0 ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text style={styles.avgNum}>{avg.toFixed(1)}</Text>
              <Stars value={avg} size={14} />
              <Text style={styles.summarySub}>리뷰 {reviews.length}개</Text>
            </View>
          ) : (
            <Text style={styles.muted}>아직 없음</Text>
          )}
        </View>

        {/* 리뷰 쓰기 (함께 친 사람만) */}
        {canReview ? (
          <Button
            title={myReview ? '내 리뷰 수정' : '리뷰 쓰기'}
            variant="secondary"
            onPress={() => setComposerOpen(true)}
            style={{ marginTop: 4 }}
          />
        ) : uid && uid !== id ? (
          <Text style={styles.hint}>함께 친 모임이 있으면 리뷰를 남길 수 있어요.</Text>
        ) : null}

        {/* 리뷰 목록 */}
        <View style={{ gap: Spacing.three, marginTop: 4 }}>
          {reviews.map((r) => (
            <View key={r.id} style={styles.reviewCard}>
              <View style={styles.reviewHead}>
                <Avatar nickname={r.reviewer_nickname} uri={r.reviewer_avatar_url} size={32} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewer}>{r.reviewer_nickname}</Text>
                  <Text style={styles.reviewDate}>{formatMeetupTime(r.updated_at)}</Text>
                </View>
                <Stars value={r.rating} size={15} />
              </View>
              {r.comment ? <Text style={styles.reviewComment}>{r.comment}</Text> : null}
            </View>
          ))}
          {reviews.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={26} color="#9CA3AF" />
              <Text style={styles.muted}>아직 리뷰가 없어요.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* 리뷰 작성 모달 */}
      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{profile.nickname}님 리뷰</Text>
            <View style={styles.starPick}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={34} color="#F5A623" />
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              placeholder="한줄평 (선택) — 매너, 실력, 시간 약속 등"
              placeholderTextColor="#9CA3AF"
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={200}
            />
            <View style={styles.modalBtns}>
              <Button title="취소" variant="secondary" onPress={() => setComposerOpen(false)} style={{ flex: 1 }} />
              <Button title={saving ? '저장 중…' : '저장'} onPress={submitReview} loading={saving} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 40 },
  muted: { fontSize: 14, color: '#9CA3AF' },
  hint: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 2 },

  headerCard: { backgroundColor: '#FFFFFF', borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: Spacing.four, alignItems: 'center', gap: 6 },
  name: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 4 },
  sub: { fontSize: 14, color: '#6B7280' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#F6F7F9' },
  duprChip: { backgroundColor: '#EAF1FF' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  selfInput: { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  bio: { fontSize: 14, lineHeight: 20, color: '#374151', textAlign: 'center', marginTop: 6 },

  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderRadius: 18, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: Spacing.three },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  summarySub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  avgNum: { fontSize: 26, fontWeight: '800', color: '#111827' },

  reviewCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: Spacing.three, gap: 8 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reviewer: { fontSize: 14, fontWeight: '700', color: '#111827' },
  reviewDate: { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  reviewComment: { fontSize: 14, lineHeight: 20, color: '#374151' },

  emptyCard: { alignItems: 'center', gap: 8, paddingVertical: 28, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', backgroundColor: '#FFFFFF' },

  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderCurve: 'continuous', padding: Spacing.four, gap: Spacing.three, paddingBottom: 36 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  starPick: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  input: { minHeight: 84, borderRadius: 14, borderCurve: 'continuous', borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 15, color: '#111827', textAlignVertical: 'top', backgroundColor: '#F9FAFB' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
