import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ReportBlock } from '@/components/report-block';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { confirmDestructive } from '@/lib/confirm';
import { formatRelative } from '@/lib/format';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { CourtReviewWithAuthor } from '@/lib/types';

// 별점 표시(읽기)
function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const full = Math.round(value);
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={n <= full ? 'star' : 'star-outline'} size={size} color="#F5A623" />
      ))}
    </View>
  );
}

// 코트 리뷰 섹션 — 코트 상세에 삽입. 평균★·목록·작성(예약자만)·신고/차단. 자체 완결.
export function CourtReviews({ courtId }: { courtId: string }) {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [reviews, setReviews] = useState<CourtReviewWithAuthor[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data }, elig, blocked] = await Promise.all([
      supabase
        .from('court_reviews_with_author')
        .select('*')
        .eq('court_id', courtId)
        .order('created_at', { ascending: false }),
      uid ? supabase.rpc('has_reserved_court', { a: uid, c: courtId }) : Promise.resolve({ data: false }),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    const blockedSet = new Set(blocked);
    const list = (data ?? []).filter((r) => !blockedSet.has(r.user_id));
    setReviews(list);
    setCanReview(!!elig.data);
    const mine = list.find((r) => r.user_id === uid);
    if (mine) {
      setRating(mine.rating);
      setComment(mine.comment);
    }
    setLoading(false);
  }, [courtId, uid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function submit() {
    if (!uid) return;
    setSaving(true);
    const { error } = await supabase.from('court_reviews').upsert(
      { court_id: courtId, user_id: uid, rating, comment: comment.trim(), updated_at: new Date().toISOString() },
      { onConflict: 'court_id,user_id' },
    );
    setSaving(false);
    if (error) {
      Alert.alert('등록 실패', error.message);
      return;
    }
    setOpen(false);
    load();
  }

  function removeMine(id: string) {
    confirmDestructive('리뷰 삭제', '내 코트 리뷰를 삭제할까요?', '삭제', async () => {
      const { error } = await supabase.from('court_reviews').delete().eq('id', id);
      if (error) Alert.alert('삭제 실패', error.message);
      else {
        setComment('');
        setRating(5);
        load();
      }
    });
  }

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const myReview = reviews.find((r) => r.user_id === uid);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>코트 리뷰</Text>
        {reviews.length > 0 ? (
          <View style={styles.avgRow}>
            <Stars value={avg} size={14} />
            <Text style={styles.avgText}>
              {avg.toFixed(1)} · {reviews.length}
            </Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#16C784" style={{ marginVertical: 16 }} />
      ) : (
        <>
          {/* 작성/수정 버튼 or 안내 */}
          {canReview ? (
            <Pressable onPress={() => setOpen(true)} style={styles.writeBtn}>
              <Ionicons name="create-outline" size={16} color="#16A34A" />
              <Text style={styles.writeText}>{myReview ? '내 리뷰 수정' : '리뷰 쓰기'}</Text>
            </Pressable>
          ) : uid ? (
            <Text style={styles.hint}>이 코트를 예약하면 리뷰를 남길 수 있어요.</Text>
          ) : null}

          {reviews.length === 0 ? (
            <Text style={styles.empty}>아직 리뷰가 없어요. 첫 리뷰를 남겨보세요.</Text>
          ) : (
            <View style={{ gap: Spacing.three, marginTop: 4 }}>
              {reviews.map((r) => {
                const mine = r.user_id === uid;
                return (
                  <View key={r.id} style={styles.review}>
                    <View style={styles.reviewHead}>
                      <Text style={styles.author}>{r.author_nickname}</Text>
                      <Stars value={r.rating} size={13} />
                      <Text style={styles.time}>{formatRelative(r.created_at)}</Text>
                      <View style={{ flex: 1 }} />
                      {mine ? (
                        <Pressable onPress={() => removeMine(r.id)} hitSlop={8}>
                          <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                        </Pressable>
                      ) : (
                        <ReportBlock targetType="court_review" targetId={r.id} targetUserId={r.user_id} />
                      )}
                    </View>
                    {r.comment ? <Text style={styles.comment}>{r.comment}</Text> : null}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      {/* 작성 모달 */}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>코트는 어땠나요?</Text>
            <View style={styles.starPick}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
                  <Ionicons name={n <= rating ? 'star' : 'star-outline'} size={34} color="#F5A623" />
                </Pressable>
              ))}
            </View>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="시설·바닥·주차 등 솔직한 후기를 남겨주세요 (선택)"
              placeholderTextColor="#9CA3AF"
              style={styles.input}
              multiline
              textAlignVertical="top"
            />
            <View style={styles.sheetBtns}>
              <Pressable onPress={() => setOpen(false)} style={[styles.sheetBtn, styles.cancelBtn]}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable onPress={submit} disabled={saving} style={[styles.sheetBtn, styles.saveBtn]}>
                <Text style={styles.saveText}>{saving ? '저장 중…' : '등록'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  avgRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avgText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  writeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: '#E7F6EC',
  },
  writeText: { fontSize: 14, fontWeight: '800', color: '#16A34A' },
  hint: { fontSize: 13, color: '#9CA3AF' },
  empty: { fontSize: 14, color: '#9CA3AF', paddingVertical: 4 },
  review: { backgroundColor: '#F9FAFB', borderRadius: 14, borderCurve: 'continuous', padding: Spacing.three, gap: 6 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 14, fontWeight: '700', color: '#374151' },
  time: { fontSize: 12, color: '#9CA3AF' },
  comment: { fontSize: 15, lineHeight: 21, color: '#1F2937' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: Spacing.four, gap: 16, paddingBottom: 32 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827', textAlign: 'center' },
  starPick: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  input: {
    minHeight: 100,
    fontSize: 15,
    lineHeight: 22,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
  },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  sheetBtn: { flex: 1, height: 50, borderRadius: 14, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center' },
  cancelBtn: { backgroundColor: '#F3F4F6' },
  cancelText: { fontSize: 16, fontWeight: '700', color: '#6B7280' },
  saveBtn: { backgroundColor: '#16C784' },
  saveText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
});
