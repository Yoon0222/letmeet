import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { completeMeetup, fetchMeetupCompletion } from '@/lib/challenge';
import { AppAlert as Alert } from '@/lib/feedback';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AttendanceStatus, MeetupCompletion, MeetupStatus } from '@/lib/types';
import { AppColors } from '@/theme';

type MeetupLite = { id: string; title: string; host_id: string; start_time: string; status: MeetupStatus };
type Person = { user_id: string; nickname: string; avatar_url: string | null };

// 모임 완료 처리(호스트) — 모임 시작 시간이 지난 뒤, 실제로 온 사람을 골라 확정한다.
//   확정은 서버 함수(meetup_complete)가 한다: 참석자 2명 이상, 승인된 참가자만, 한 번만.
//   확정한 뒤에는 호스트도 고칠 수 없다(잘못 처리한 것은 운영자가 정정).
export default function MeetupCompleteScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const uid = session?.user.id;

  const [meetup, setMeetup] = useState<MeetupLite | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [completion, setCompletion] = useState<MeetupCompletion | null | undefined>(null);
  const [nowMs, setNowMs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null); // 실패 사유 — 토스트가 사라져도 화면에 남긴다

  const load = useCallback(async () => {
    if (!id) return;
    const [meetupRes, partRes, done] = await Promise.all([
      supabase.from('meetups').select('id, title, host_id, start_time, status').eq('id', id).maybeSingle(),
      supabase
        .from('meetup_participants')
        .select('user_id, status, profiles(id, nickname, avatar_url)')
        .eq('meetup_id', id)
        .eq('status', 'approved')
        .order('joined_at', { ascending: true }),
      fetchMeetupCompletion(id),
    ]);
    if (meetupRes.error || partRes.error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    const m = (meetupRes.data as MeetupLite | null) ?? null;
    const rows = (partRes.data as unknown as { user_id: string; profiles: { nickname: string; avatar_url: string | null } | null }[] | null) ?? [];
    const list: Person[] = rows.map((r) => ({ user_id: r.user_id, nickname: r.profiles?.nickname ?? '알 수 없음', avatar_url: r.profiles?.avatar_url ?? null }));
    // 호스트는 참가자 목록에 없더라도 고를 수 있다(서버 규칙과 같게)
    if (m && !list.some((p) => p.user_id === m.host_id)) {
      const { data: host } = await supabase.from('profiles').select('id, nickname, avatar_url').eq('id', m.host_id).maybeSingle();
      list.unshift({ user_id: m.host_id, nickname: host?.nickname ?? '호스트', avatar_url: host?.avatar_url ?? null });
    }
    setMeetup(m);
    setPeople(list);
    // 그 사이 빠진 사람의 선택은 버린다
    setMarks((prev) => Object.fromEntries(Object.entries(prev).filter(([userId]) => list.some((p) => p.user_id === userId))));
    setCompletion(done);
    setNowMs(Date.now());
    setLoadFailed(false);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function message(title: string, body?: string) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>{title}</Text>
          {body ? <Text style={styles.centerBody}>{body}</Text> : null}
          <Button title="돌아가기" variant="outline" onPress={() => router.back()} style={styles.wide} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadFailed) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>모임 정보를 불러오지 못했어요</Text>
          <Text style={styles.centerBody}>네트워크 상태를 확인하고 다시 시도해주세요.</Text>
          <Button
            title="다시 시도"
            variant="outline"
            onPress={() => {
              setLoadFailed(false);
              setLoading(true);
              load();
            }}
            style={styles.wide}
          />
        </View>
      </SafeAreaView>
    );
  }
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={AppColors.primary} />
        </View>
      </SafeAreaView>
    );
  }
  if (!meetup) return message('모임을 찾을 수 없어요');
  if (meetup.host_id !== uid) return message('호스트만 완료 처리할 수 있어요');
  if (completion === undefined) return message('지금은 완료 처리를 할 수 없어요', '잠시 후 다시 시도해주세요.');
  if (completion?.status === 'voided') return message('운영자가 완료를 취소한 모임이에요', '다시 처리하려면 고객지원으로 문의해주세요.');
  if (completion) return message('이미 완료 처리된 모임이에요', '잘못 처리했다면 고객지원으로 문의해주세요.');
  if (meetup.status === 'cancelled') return message('취소된 모임은 완료 처리할 수 없어요');
  if (new Date(meetup.start_time).getTime() > nowMs) {
    return message('아직 시작 전인 모임이에요', `${formatMeetupTime(meetup.start_time)} 이후에 완료 처리할 수 있어요.`);
  }

  const statusOf = (userId: string): AttendanceStatus => marks[userId] ?? 'unknown';
  const present = people.filter((p) => statusOf(p.user_id) === 'present');
  const absent = people.filter((p) => statusOf(p.user_id) === 'absent');
  const unknownCount = people.length - present.length - absent.length;
  const hostPresent = statusOf(meetup.host_id) === 'present';
  const enough = present.length >= 2;

  // 같은 버튼을 다시 누르면 미확인으로 돌아간다
  function toggle(userId: string, next: 'present' | 'absent') {
    setFailure(null);
    setMarks((prev) => ({ ...prev, [userId]: prev[userId] === next ? 'unknown' : next }));
  }

  function markAllPresent() {
    setFailure(null);
    setMarks(Object.fromEntries(people.map((p) => [p.user_id, 'present' as AttendanceStatus])));
  }

  async function submit() {
    setFailure(null);
    setSaving(true);
    const res = await completeMeetup(
      meetup!.id,
      present.map((p) => p.user_id),
      absent.map((p) => p.user_id),
    );
    setSaving(false);
    if (!res.ok) {
      if (res.code === 'already_completed') {
        // 이미 처리된 것(두 번 눌렀거나 다른 기기에서 처리) — 실패가 아니다
        Alert.alert('완료 처리됨', '이미 완료 처리된 모임이에요.', [{ text: '확인', onPress: () => router.back() }]);
        return;
      }
      setFailure(res.error);
      Alert.alert('완료 처리 실패', res.error);
      if (res.code === 'invalid_member') load();
      return;
    }
    Alert.alert('모임 완료', `참석 ${present.length}명으로 완료 처리했어요.`, [{ text: '확인', onPress: () => router.back() }]);
  }

  function confirmSubmit() {
    const parts = [`참석 ${present.length}명`];
    if (absent.length > 0) parts.push(`불참 ${absent.length}명`);
    if (unknownCount > 0) parts.push(`미확인 ${unknownCount}명`);
    Alert.alert(
      '모임 완료 처리',
      `${parts.join(' · ')}으로 완료할까요?\n완료한 뒤에는 수정할 수 없어요. 잘못 처리했다면 고객지원으로 문의해주세요.`,
      [
        { text: '닫기', style: 'cancel' },
        { text: '완료 처리', onPress: submit },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title} numberOfLines={2}>
            {meetup.title}
          </Text>
          <Text style={styles.sub}>{formatMeetupTime(meetup.start_time)}</Text>
          <Text style={styles.sub}>
            실제로 온 사람을 참석으로 골라주세요. 참석으로 확인된 사람만 모임 참여 기록(이벤트 참여 횟수 포함)에 반영돼요.
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.sectionTitle}>참가자 {people.length}명</Text>
            <Pressable onPress={markAllPresent} disabled={saving} hitSlop={8}>
              <Text style={styles.link}>모두 참석</Text>
            </Pressable>
          </View>
          {people.map((p) => {
            const st = statusOf(p.user_id);
            return (
              <View key={p.user_id} style={styles.personRow}>
                <Avatar nickname={p.nickname} uri={p.avatar_url} size={38} />
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {p.nickname}
                    </Text>
                    {p.user_id === meetup.host_id ? <Badge label="호스트" color="#2D7FF9" bg="rgba(45,127,249,0.14)" /> : null}
                  </View>
                  {st === 'unknown' ? <Text style={styles.muted}>미확인</Text> : null}
                </View>
                <Pressable
                  onPress={() => toggle(p.user_id, 'present')}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected: st === 'present' }}
                  style={[styles.choice, st === 'present' && styles.choicePresent]}>
                  <Ionicons name="checkmark" size={15} color={st === 'present' ? '#07110C' : AppColors.textSecondary} />
                  <Text style={[styles.choiceText, st === 'present' && styles.choiceTextPresent]}>참석</Text>
                </Pressable>
                <Pressable
                  onPress={() => toggle(p.user_id, 'absent')}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityState={{ selected: st === 'absent' }}
                  style={[styles.choice, st === 'absent' && styles.choiceAbsent]}>
                  <Text style={[styles.choiceText, st === 'absent' && styles.choiceTextAbsent]}>불참</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            참석 {present.length}명 · 불참 {absent.length}명 · 미확인 {unknownCount}명
          </Text>
          {!enough ? <Text style={styles.warn}>참석자가 2명 이상이어야 완료할 수 있어요.</Text> : null}
          {enough && !hostPresent ? (
            <Text style={styles.warn}>호스트 본인이 참석으로 체크되지 않았어요. 본인도 참석했다면 체크해주세요.</Text>
          ) : null}
          {unknownCount > 0 ? <Text style={styles.sub}>미확인으로 남은 사람은 참석으로 인정되지 않아요.</Text> : null}
          {failure ? <Text style={styles.failure}>{failure}</Text> : null}
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <Button title="모임 완료 처리" onPress={confirmSubmit} loading={saving} disabled={!enough} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AppColors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.two },
  centerTitle: { color: AppColors.textPrimary, fontSize: 18, fontWeight: '900', textAlign: 'center' },
  centerBody: { color: AppColors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  wide: { alignSelf: 'stretch', marginTop: Spacing.two },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.four },
  card: {
    borderRadius: 20,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
    borderWidth: 1,
    borderColor: AppColors.border,
    padding: Spacing.three,
    gap: 10,
  },
  title: { color: AppColors.textPrimary, fontSize: 20, fontWeight: '900' },
  sectionTitle: { color: AppColors.textPrimary, fontSize: 16, fontWeight: '900' },
  sub: { color: AppColors.textSecondary, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  muted: { color: AppColors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 },
  warn: { color: AppColors.warningText, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  failure: {
    color: AppColors.textPrimary,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,107,0.14)',
    overflow: 'hidden',
  },
  link: { color: AppColors.primary, fontSize: 13, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: AppColors.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flexShrink: 1, color: AppColors.textPrimary, fontSize: 15, fontWeight: '700' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  choicePresent: { backgroundColor: AppColors.primary, borderColor: AppColors.primary },
  choiceAbsent: { backgroundColor: 'rgba(248,113,113,0.16)', borderColor: 'rgba(248,113,113,0.5)' },
  choiceText: { color: AppColors.textSecondary, fontSize: 13, fontWeight: '800' },
  choiceTextPresent: { color: '#07110C' },
  choiceTextAbsent: { color: '#F87171' },
  actionBar: { padding: Spacing.three, borderTopWidth: 1, borderTopColor: AppColors.border, backgroundColor: AppColors.background },
});
