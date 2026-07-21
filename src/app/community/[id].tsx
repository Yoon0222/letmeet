import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportBlock } from '@/components/report-block';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { confirmDestructive } from '@/lib/confirm';
import { categoryMeta } from '@/lib/community';
import { formatRelative } from '@/lib/format';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { CommunityCommentWithAuthor, CommunityPostWithCounts } from '@/lib/types';

export default function CommunityDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [post, setPost] = useState<CommunityPostWithCounts | null>(null);
  const [comments, setComments] = useState<CommunityCommentWithAuthor[]>([]);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: p }, { data: cs }, { data: myLike }, blocked] = await Promise.all([
      supabase.from('community_posts_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('community_comments')
        .select('*, profiles(id,nickname,skill_level,avatar_url)')
        .eq('post_id', id)
        .order('created_at', { ascending: true }),
      uid
        ? supabase.from('community_post_likes').select('post_id').eq('post_id', id).eq('user_id', uid).maybeSingle()
        : Promise.resolve({ data: null }),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    setPost(p ?? null);
    setLikeCount(p?.like_count ?? 0);
    setLiked(!!myLike);
    const blockedSet = new Set(blocked);
    const list = (cs as unknown as CommunityCommentWithAuthor[]) ?? [];
    setComments(list.filter((c) => !blockedSet.has(c.author_id)));
    setLoading(false);
  }, [id, uid]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function toggleLike() {
    if (!uid || !id) {
      if (!uid) router.push('/(auth)/sign-in');
      return;
    }
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    const { error } = next
      ? await supabase.from('community_post_likes').insert({ post_id: id, user_id: uid })
      : await supabase.from('community_post_likes').delete().eq('post_id', id).eq('user_id', uid);
    if (error) {
      setLiked(!next); // 롤백
      setLikeCount((c) => c + (next ? -1 : 1));
    }
  }

  async function sendComment() {
    if (!uid) {
      router.push('/(auth)/sign-in');
      return;
    }
    const b = input.trim();
    if (!b || !id) return;
    setSending(true);
    const { error } = await supabase.from('community_comments').insert({ post_id: id, author_id: uid, body: b });
    setSending(false);
    if (error) {
      Alert.alert('댓글 실패', error.message);
      return;
    }
    setInput('');
    load();
  }

  function deleteComment(commentId: string) {
    confirmDestructive('댓글 삭제', '이 댓글을 삭제할까요?', '삭제', async () => {
      const { error } = await supabase.from('community_comments').delete().eq('id', commentId);
      if (error) Alert.alert('삭제 실패', error.message);
      else load();
    });
  }

  function deletePost() {
    if (!id) return;
    confirmDestructive('게시글 삭제', '이 글을 삭제할까요? 되돌릴 수 없어요.', '삭제', async () => {
      const { error } = await supabase.from('community_posts').delete().eq('id', id);
      if (error) Alert.alert('삭제 실패', error.message);
      else router.back();
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }
  if (!post) {
    return (
      <View style={styles.center}>
        <Text style={styles.gone}>삭제되었거나 존재하지 않는 글이에요.</Text>
      </View>
    );
  }

  const cat = categoryMeta(post.category);
  const isAuthor = post.author_id === uid;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 헤더: 카테고리 + 작성자 + 액션 */}
          <View style={styles.topRow}>
            <View style={[styles.badge, { backgroundColor: cat.bg }]}>
              <Ionicons name={cat.icon} size={12} color={cat.color} />
              <Text style={[styles.badgeText, { color: cat.color }]}>{cat.label}</Text>
            </View>
            {isAuthor ? (
              <Pressable onPress={deletePost} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#E5484D" />
              </Pressable>
            ) : (
              <ReportBlock
                targetType="community_post"
                targetId={post.id}
                targetUserId={post.author_id}
                targetLabel={post.title}
                onBlocked={() => router.back()}
              />
            )}
          </View>

          <Text style={styles.title}>{post.title}</Text>
          <View style={styles.authorRow}>
            <Text style={styles.author}>{post.author_nickname}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.time}>{formatRelative(post.created_at)}</Text>
          </View>

          {/* 이미지 캐러셀 */}
          {post.images.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.carousel}
              style={{ marginHorizontal: -Spacing.four }}>
              {post.images.map((url) => (
                <Image key={url} source={{ uri: url }} style={styles.postImage} />
              ))}
            </ScrollView>
          ) : null}

          {post.body ? <Text style={styles.body}>{post.body}</Text> : null}

          {/* 좋아요 */}
          <Pressable onPress={toggleLike} style={[styles.likeBtn, liked && styles.likeBtnOn]}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? '#E5484D' : '#6B7280'} />
            <Text style={[styles.likeText, liked && { color: '#E5484D' }]}>좋아요 {likeCount}</Text>
          </Pressable>

          {/* 댓글 */}
          <Text style={styles.commentsTitle}>댓글 {comments.length}</Text>
          {comments.length === 0 ? (
            <Text style={styles.noComment}>첫 댓글을 남겨보세요.</Text>
          ) : (
            <View style={{ gap: Spacing.three }}>
              {comments.map((c) => {
                const mine = c.author_id === uid;
                const canDelete = mine || isAuthor;
                return (
                  <View key={c.id} style={styles.comment}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.commentHead}>
                        <Text style={styles.commentAuthor}>{c.profiles?.nickname ?? '알 수 없음'}</Text>
                        <Text style={styles.dot}>·</Text>
                        <Text style={styles.time}>{formatRelative(c.created_at)}</Text>
                      </View>
                      <Text style={styles.commentBody}>{c.body}</Text>
                    </View>
                    {canDelete ? (
                      <Pressable onPress={() => deleteComment(c.id)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={16} color="#9CA3AF" />
                      </Pressable>
                    ) : (
                      <ReportBlock targetType="community_comment" targetId={c.id} targetUserId={c.author_id} />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* 댓글 입력 */}
        <View style={styles.inputBar}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="댓글을 입력하세요"
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
          />
          <Pressable onPress={sendComment} disabled={sending || !input.trim()} style={[styles.send, (!input.trim() || sending) && styles.sendOff]}>
            <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  gone: { fontSize: 15, color: '#6B7280' },
  content: { padding: Spacing.four, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 12 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  author: { fontSize: 14, fontWeight: '700', color: '#374151' },
  dot: { color: '#D1D5DB' },
  time: { fontSize: 13, color: '#9CA3AF' },
  carousel: { paddingHorizontal: Spacing.four, gap: 8, marginTop: 16 },
  postImage: { width: 280, height: 210, borderRadius: 14, borderCurve: 'continuous', backgroundColor: '#F3F4F6' },
  body: { fontSize: 16, lineHeight: 24, color: '#1F2937', marginTop: 16 },
  likeBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    marginTop: 20,
  },
  likeBtnOn: { backgroundColor: '#FDECEC', borderColor: '#F7C7C7' },
  likeText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  commentsTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 28, marginBottom: 12 },
  noComment: { fontSize: 14, color: '#9CA3AF', paddingVertical: 8 },
  comment: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#374151' },
  commentBody: { fontSize: 15, lineHeight: 21, color: '#1F2937', marginTop: 3 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.four,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF0F2',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    minHeight: 42,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  send: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#16C784', alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: '#C7CDD4' },
});
