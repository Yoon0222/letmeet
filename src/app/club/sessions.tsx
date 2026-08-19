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

export default function ClubSessions() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { isPremiumUsable, canManage, loading: accessLoading } = useClubAccess(clubId);
  const [sessions, setSessions] = useState<ClubSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) return;
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

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {isPremiumUsable && canManage ? (
          <Pressable onPress={() => router.push({ pathname: '/club/session-create', params: { clubId } })} style={styles.createBtn}>
            <Ionicons name="add" size={18} color="#07100D" />
            <Text style={styles.createTxt}>정기모임 개설</Text>
          </Pressable>
        ) : null}

        {!isPremiumUsable ? (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>프리미엄 클럽에서 정기모임 대진을 운영할 수 있어요.</Text>
          </View>
        ) : sessions.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>아직 개설된 정기모임이 없어요.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {sessions.map((s) => (
              <Pressable key={s.id} onPress={() => router.push({ pathname: '/club/session/[id]', params: { id: s.id } })} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{s.title || '정기모임'}</Text>
                  <Text style={styles.cardMeta}>{s.session_date.replaceAll('-', '.')} · 코트 {s.court_count}면 · {STATUS[s.status] ?? s.status}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#707B87" />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#070A0D' },
  content: { padding: Spacing.four, gap: Spacing.three },
  createBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16C784', borderRadius: 16, borderCurve: 'continuous' },
  createTxt: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  emptyBox: { minHeight: 80, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three },
  emptyTxt: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: Spacing.three },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#AAB4C0', fontSize: 13, fontWeight: '700', marginTop: 3 },
});
