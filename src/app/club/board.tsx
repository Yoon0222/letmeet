// 클럽 게시판 (0088) — 클럽원 전용 글 목록 + 글쓰기(공지는 운영진만).
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubPostWithAuthor } from '@/lib/types';

export default function ClubBoard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { uid, isOwner, isApprovedMember, canManage, loading: accessLoading } = useClubAccess(clubId);

  const [posts, setPosts] = useState<ClubPostWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  // 글쓰기 모달
  const [writeOpen, setWriteOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isNotice, setIsNotice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [keyboardBottom, setKeyboardBottom] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardBottom(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardBottom(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [insets.bottom]);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('club_posts_with_authors')
      .select('*')
      .eq('club_id', clubId)
      .order('is_notice', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    setPosts((data as ClubPostWithAuthor[] | null) ?? []);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const canRead = isOwner || isApprovedMember;

  async function submit() {
    if (!clubId || !uid) return;
    if (!title.trim()) {
      Alert.alert('입력 확인', '제목을 입력해주세요.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('club_posts').insert({
      club_id: clubId,
      author_id: uid,
      title: title.trim(),
      body: body.trim(),
      is_notice: canManage && isNotice,
    });
    setSaving(false);
    if (error) {
      Alert.alert('등록 실패', error.message);
      return;
    }
    setWriteOpen(false);
    setTitle('');
    setBody('');
    setIsNotice(false);
    load();
  }

  if (loading || accessLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#16C784" />
      </View>
    );
  }

  if (!canRead) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={40} color="#707B87" />
        <Text style={styles.lockTitle}>클럽원 전용 게시판이에요</Text>
        <Text style={styles.lockBody}>클럽에 가입하고 승인되면 볼 수 있어요.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/club/post/[id]', params: { id: item.id, clubId } } as never)}
            style={[styles.card, item.is_notice && styles.cardNotice]}>
            <View style={styles.cardTop}>
              {item.is_notice ? (
                <View style={styles.noticeBadge}>
                  <Ionicons name="megaphone" size={11} color="#F59E0B" />
                  <Text style={styles.noticeBadgeText}>공지</Text>
                </View>
              ) : null}
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </View>
            {item.body ? (
              <Text style={styles.cardBody} numberOfLines={2}>
                {item.body}
              </Text>
            ) : null}
            <View style={styles.cardMeta}>
              <Avatar nickname={item.author_nickname} uri={item.author_avatar_url} size={20} />
              <Text style={styles.cardAuthor}>{item.author_nickname}</Text>
              <Text style={styles.cardTime}>{formatMeetupTime(item.created_at)}</Text>
              <View style={{ flex: 1 }} />
              <Ionicons name="chatbubble-outline" size={13} color="#707B87" />
              <Text style={styles.cardCount}>{item.comment_count}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="chatbox-ellipses-outline" size={44} color="#707B87" />
            <Text style={styles.emptyTitle}>아직 글이 없어요</Text>
            <Text style={styles.emptyBody}>첫 글이나 공지를 남겨보세요.</Text>
          </View>
        }
      />

      <View style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <Button title="글쓰기" onPress={() => setWriteOpen(true)} />
      </View>

      {/* 글쓰기 모달 */}
      <Modal visible={writeOpen} transparent animationType="slide" onRequestClose={() => setWriteOpen(false)}>
        <View style={styles.modalWrap}>
          <KeyboardAvoidingView style={styles.modalKeyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.modalCard, { marginBottom: keyboardBottom, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
              <Text style={styles.modalTitle}>새 글 쓰기</Text>
              <TextInput
                style={styles.input}
                placeholder="제목"
                placeholderTextColor="#707B87"
                value={title}
                onChangeText={setTitle}
                maxLength={80}
              />
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="내용을 입력하세요"
                placeholderTextColor="#707B87"
                value={body}
                onChangeText={setBody}
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              {canManage ? (
                <View style={styles.noticeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.noticeRowTitle}>공지로 등록</Text>
                    <Text style={styles.noticeRowSub}>공지는 목록 맨 위에 고정 표시돼요. (클럽장·임원 전용)</Text>
                  </View>
                  <Switch
                    value={isNotice}
                    onValueChange={setIsNotice}
                    trackColor={{ false: 'rgba(255,255,255,0.12)', true: '#F59E0B' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ) : null}
              <View style={styles.modalBtns}>
                <Button title="닫기" variant="secondary" onPress={() => setWriteOpen(false)} style={{ flex: 1 }} />
                <Button title="등록" onPress={submit} loading={saving} style={{ flex: 1 }} />
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#070A0D', padding: 32 },
  lockTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC', marginTop: 8 },
  lockBody: { fontSize: 14, color: '#AAB4C0' },
  list: { padding: Spacing.four, gap: Spacing.two, paddingBottom: 120 },
  card: {
    backgroundColor: '#10161D',
    borderRadius: 16,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.three,
    gap: 8,
  },
  cardNotice: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.06)' },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.14)',
  },
  noticeBadgeText: { fontSize: 11, fontWeight: '900', color: '#F59E0B' },
  cardTitle: { flex: 1, fontSize: 15.5, fontWeight: '800', color: '#F8FAFC' },
  cardBody: { fontSize: 13.5, lineHeight: 19, color: '#AAB4C0' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardAuthor: { fontSize: 12.5, fontWeight: '700', color: '#AAB4C0' },
  cardTime: { fontSize: 12, color: '#707B87' },
  cardCount: { fontSize: 12.5, fontWeight: '800', color: '#707B87' },
  empty: { alignItems: 'center', gap: 6, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: '#F8FAFC' },
  emptyBody: { fontSize: 14, color: '#AAB4C0' },
  actionBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.three, backgroundColor: '#070A0D', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.09)' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', justifyContent: 'flex-end' },
  modalKeyboard: { justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#10161D',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.09)',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#F8FAFC' },
  input: {
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: '#151D25',
    padding: 12,
    fontSize: 15,
    color: '#F8FAFC',
  },
  textarea: { minHeight: 120 },
  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 4 },
  noticeRowTitle: { fontSize: 14.5, fontWeight: '800', color: '#F59E0B' },
  noticeRowSub: { fontSize: 12, lineHeight: 17, color: '#AAB4C0', marginTop: 2 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 4 },
});
