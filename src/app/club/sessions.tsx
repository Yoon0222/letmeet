import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { ClubSession } from '@/lib/types';

const STATUS: Record<string, string> = { voting: '투표 중', matched: '대진 완료', ongoing: '진행 중', finished: '종료', canceled: '취소' };

// 오늘(기기 로컬) 날짜 yyyy-MM-dd — session_date 와 문자열 비교로 지난 모임을 가른다.
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ClubSessions() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { isPremiumUsable, canManage, isOwner, loading: accessLoading } = useClubAccess(clubId);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) return;
    // 반복 스케줄로 도래한 회차 자동 보충(on-read)
    await supabase.rpc('generate_due_club_sessions', { p_club_id: clubId });
    const { data } = await supabase
      .from('club_sessions')
      .select('*')
      .eq('club_id', clubId)
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });
    setSessions((data as ClubSession[] | null) ?? []);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || accessLoading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }

  // 날짜가 지났거나 종료/취소된 모임 = 지난 모임. 지난 모임은 운영진에게만 보인다
  // (일반 멤버는 결과를 '경기 결과' 메뉴에서 확인).
  const today = todayStr();
  const isPast = (s: ClubSession) => s.session_date < today || s.status === 'finished' || s.status === 'canceled';
  const upcoming = sessions.filter((s) => !isPast(s)).sort((a, b) => a.session_date.localeCompare(b.session_date));
  const past = canManage ? sessions.filter(isPast) : [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isPremiumUsable && canManage ? (
          <Pressable onPress={() => router.push({ pathname: '/club/session-create', params: { clubId } })} style={styles.createBtn}>
            <Ionicons name="add" size={18} color="#07100D" />
            <Text style={styles.createTxt}>정기모임 개설</Text>
          </Pressable>
        ) : null}

        {isPremiumUsable && isOwner ? (
          <Pressable onPress={() => router.push({ pathname: '/club/session-schedule', params: { clubId } })} style={styles.scheduleBtn}>
            <Ionicons name="repeat" size={16} color="#16C784" />
            <Text style={styles.scheduleTxt}>반복 스케줄 설정 (매주 자동 개설)</Text>
          </Pressable>
        ) : null}

        {!isPremiumUsable ? (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>프리미엄 클럽에서 정기모임 대진을 운영할 수 있어요.</Text>
          </View>
        ) : (
          <View style={{ gap: Spacing.three }}>
            <View style={{ gap: 10 }}>
              {past.length > 0 ? <Text style={styles.sectionTitle}>예정된 모임 {upcoming.length}</Text> : null}
              {upcoming.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Ionicons name="calendar-outline" size={20} color="#AAB4C0" />
                  <Text style={styles.emptyTxt}>예정된 정기모임이 없어요.</Text>
                </View>
              ) : (
                upcoming.map((s) => <SessionCard key={s.id} session={s} onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: s.id } })} />)
              )}
            </View>

            {past.length > 0 ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.sectionTitle}>지난 모임 {past.length}</Text>
                <Text style={styles.sectionHint}>운영진에게만 보여요 · 결과는 모임 상세의 대진·순위 탭에서.</Text>
                {past.map((s) => (
                  <SessionCard key={s.id} session={s} dim onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: s.id } })} />
                ))}
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionCard({ session: s, dim, onPress }: { session: ClubSession; dim?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.card, dim && styles.cardPast]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle} numberOfLines={1}>{s.title || '정기모임'}</Text>
        <Text style={styles.cardMeta}>{s.session_date.replaceAll('-', '.')} · 코트 {s.court_count}면 · {STATUS[s.status] ?? s.status}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#707B87" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three },
  createBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16C784', borderRadius: 16, borderCurve: 'continuous' },
  createTxt: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  scheduleBtn: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(22,199,132,0.35)', borderRadius: 16, borderCurve: 'continuous' },
  scheduleTxt: { color: '#16C784', fontSize: 14, fontWeight: '800' },
  emptyBox: { minHeight: 80, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three },
  emptyTxt: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  sectionTitle: { color: '#F8FAFC', fontSize: 16, fontWeight: '900', marginTop: 2 },
  sectionHint: { color: '#707B87', fontSize: 12, fontWeight: '700', marginTop: -4 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three },
  cardPast: { opacity: 0.62 },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#AAB4C0', fontSize: 13, fontWeight: '700', marginTop: 3 },
});
