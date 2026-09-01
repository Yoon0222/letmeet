// 클럽 게시글 상세 (0088) — 본문 + 댓글. 삭제 = 작성자 본인/클럽장/임원.
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubPostComment, ClubPostWithAuthor } from '@/lib/types';

type CommentRow = ClubPostComment & { profiles: { nickname: string; avatar_url: string | null } | null };

export default function ClubPostDetail() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, clubId } = useLocalSearchParams<{ id: string; clubId: string }>();
  const { uid, isOwner, isOfficer, loading: accessLoading } = useClubAccess(clubId);

  const [post, setPost] = useState<ClubPostWithAuthor | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: p }, { data: cs }] = await Promise.all([
      supabase.from('club_posts_with_authors').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('club_post_comments')
        .select('*, profiles(nickname, avatar_url)')
        .eq('post_id', id)
        .order('created_at', { ascending: true }),
    ]);
    setPost((p as ClubPostWithAuthor | null) ?? null);
    setComments((cs as unknown as CommentRow[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const canModerate = isOwner || isOfficer;

  async function sendComment() {
    if (!id || !uid || !clubId) return;
    const text = comment.trim();
    if (!text) return;
    setSending(true);
    const { error } = await supabase
      .from('club_post_comments')
      .insert({ post_id: id, club_id: clubId, author_id: uid, body: text });
    setSending(false);
    if (error) {
      Alert.alert('댓글 실패', error.message);
      return;
    }
    setComment('');
    load();
  }

  function confirmDeletePost() {
    if (!post) return;
    Alert.alert('글 삭제', '이 글을 삭제할까요? 댓글도 함께 삭제돼요.', [
      { text: '닫기', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('club_posts').delete().eq('id', post.id);
          if (error) {
            Alert.alert('삭제 실패', error.message);
            return;
          }
          router.back();
        },
      },
    ]);
  }

  async function deleteComment(cid: string) {
    const { error } = await supabase.from('club_post_comments').delete().eq('id', cid);
    if (error) {
      Alert.alert('삭제 실패', error.message);
      return;
    }
    load();
  }

  if (loading || accessLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <Ionicons name="document-outline" size={40} color="#707B87" />
        <Text style={styles.missing}>글을 찾을 수 없어요 (클럽원만 볼 수 있어요)</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* 본문 */}
          <View style={[styles.postCard, post.is_notice && styles.postCardNotice]}>
            <View style={styles.titleRow}>
              {post.is_notice ? (
                <View style={styles.noticeBadge}>
                  <Ionicons name="megaphone" size={11} color="#F59E0B" />
                  <Text style={styles.noticeBadgeText}>공지</Text>
                </View>
              ) : null}
              <Text style={styles.title}>{post.title}</Text>
            </View>
            <View style={styles.metaRow}>
              <Avatar nickname={post.author_nickname} uri={post.author_avatar_url} size={26} />
              <Text style={styles.author}>{post.author_nickname}</Text>
              <Text style={styles.time}>{formatMeetupTime(post.created_at)}</Text>
              <View style={{ flex: 1 }} />
              {post.author_id === uid || canModerate ? (
                <Pressable onPress={confirmDeletePost} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color="#E5484D" />
                </Pressable>
              ) : null}
            </View>
            {post.body ? <Text style={styles.body}>{post.body}</Text> : null}
          </View>

          {/* 댓글 */}
          <Text style={styles.commentHeader}>댓글 {comments.length}</Text>
          {comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <Avatar nickname={c.profiles?.nickname ?? '?'} uri={c.profiles?.avatar_url} size={28} />
              <View style={styles.commentBubble}>
                <View style={styles.commentTop}>
                  <Text style={styles.commentAuthor}>{c.profiles?.nickname ?? '알 수 없음'}</Text>
                  <Text style={styles.commentTime}>{formatMeetupTime(c.created_at)}</Text>
                  <View style={{ flex: 1 }} />
                  {c.author_id === uid || canModerate ? (
                    <Pressable onPress={() => deleteComment(c.id)} hitSlop={8}>
                      <Ionicons name="close" size={14} color="#707B87" />
                    </Pressable>
                  ) : null}
                </View>
                <Text style={styles.commentBody}>{c.body}</Text>
              </View>
            </View>
          ))}
          {comments.length === 0 ? <Text style={styles.noComment}>첫 댓글을 남겨보세요.</Text> : null}
        </ScrollView>

        {/* 댓글 입력 */}
        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) + 6 }]}>
          <TextInput
            style={styles.input}
            placeholder="댓글을 입력하세요"
            placeholderTextColor="#707B87"
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            multiline
          />
          <Pressable onPress={sendComment} disabled={sending || !comment.trim()} style={[styles.sendBtn, (!comment.trim() || sending) && { opacity: 0.4 }]}>
            <Ionicons name="arrow-up" size={18} color="#07100D" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#070A0D', padding: 32 },
  missing: { fontSize: 14, color: '#AAB4C0', textAlign: 'center' },
  content: { padding: Spacing.four, gap: Spacing.two, paddingBottom: 24 },
  postCard: {
    backgroundColor: '#10161D',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 10,
  },
  postCardNotice: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.06)' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  noticeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: 'rgba(245,158,11,0.14)' },
  noticeBadgeText: { fontSize: 11, fontWeight: '900', color: '#F59E0B' },
  title: { flex: 1, fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 13, fontWeight: '700', color: '#AAB4C0' },
  time: { fontSize: 12, color: '#707B87' },
  body: { fontSize: 15, lineHeight: 22, color: '#E2E8F0' },
  commentHeader: { fontSize: 14, fontWeight: '900', color: '#F8FAFC', marginTop: Spacing.two },
  commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  commentBubble: {
    flex: 1,
    backgroundColor: '#10161D',
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  commentTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  commentAuthor: { fontSize: 12.5, fontWeight: '800', color: '#F8FAFC' },
  commentTime: { fontSize: 11, color: '#707B87' },
  commentBody: { fontSize: 14, lineHeight: 20, color: '#E2E8F0' },
  noComment: { fontSize: 13, color: '#707B87', textAlign: 'center', paddingVertical: 16 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#070A0D',
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#151D25',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: '#F8FAFC',
  },
  sendBtn: { width: 40, height: 40, borderRadius: 12, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center', backgroundColor: '#16C784' },
});
