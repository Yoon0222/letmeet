import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { formatMeetupTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useClubAccess } from '@/lib/use-club-access';
import type { Tournament } from '@/lib/types';

export default function ClubTournaments() {
  const router = useRouter();
  const { clubId } = useLocalSearchParams<{ clubId: string }>();
  const { isPremiumUsable, isOwner, loading: accessLoading } = useClubAccess(clubId);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId) return;
    const { data } = await supabase
      .from('tournaments')
      .select('*')
      .eq('club_id', clubId)
      .order('start_at', { ascending: false });
    setTournaments((data as Tournament[] | null) ?? []);
    setLoading(false);
  }, [clubId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading || accessLoading) {
    return <View style={styles.center}><ActivityIndicator color="#16C784" /></View>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <View style={styles.introIcon}><Ionicons name="trophy-outline" size={22} color="#16C784" /></View>
          <View style={{ flex: 1 }}><Text style={styles.introEyebrow}>CLUB TOURNAMENT</Text><Text style={styles.introTitle}>월례대회 운영</Text><Text style={styles.introText}>클럽 대회를 만들고 참가 현황과 대진을 관리하세요.</Text></View>
        </View>
        {isPremiumUsable && isOwner ? (
          <Pressable onPress={() => router.push({ pathname: '/club/tournament-create', params: { clubId } })} style={styles.createBtn}>
            <Ionicons name="add" size={18} color="#07100D" />
            <Text style={styles.createTxt}>월례대회 개설</Text>
          </Pressable>
        ) : null}

        {!isPremiumUsable ? (
          <View style={styles.emptyBox}>
            <Ionicons name="lock-closed-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>프리미엄 클럽에서 월례대회를 개설할 수 있어요.</Text>
          </View>
        ) : tournaments.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="trophy-outline" size={20} color="#AAB4C0" />
            <Text style={styles.emptyTxt}>아직 개설된 월례대회가 없어요.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {tournaments.map((t) => (
              <Pressable key={t.id} onPress={() => router.push({ pathname: '/tournament/[id]', params: { id: t.id } })} style={styles.card}>
                <View style={styles.dateBox}><Text style={styles.dateMonth}>{new Date(t.start_at).getMonth() + 1}월</Text><Text style={styles.dateDay}>{new Date(t.start_at).getDate()}</Text></View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.cardTop}><Text style={styles.status}>{t.status === 'registration' ? '접수중' : t.status === 'ongoing' ? '진행중' : t.status === 'finished' ? '종료' : '취소'}</Text><Text style={styles.cardType}>{t.format === 'team' ? '단체전' : t.discipline === 'doubles' ? '복식' : '단식'}</Text></View>
                  <Text style={styles.cardTitle} numberOfLines={1}>{t.title}</Text>
                  <Text style={styles.cardMeta}>{formatMeetupTime(t.start_at)} · {t.venue || '장소 미정'}</Text>
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
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 80 },
  intro: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingBottom: 4 },
  introIcon: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(22,199,132,0.12)' },
  introEyebrow: { color: '#16C784', fontSize: 10, fontWeight: '900' },
  introTitle: { color: '#F8FAFC', fontSize: 20, fontWeight: '900', marginTop: 2 },
  introText: { color: '#AAB4C0', fontSize: 12, fontWeight: '600', marginTop: 4 },
  createBtn: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#16C784', borderRadius: 8, borderCurve: 'continuous' },
  createTxt: { color: '#07100D', fontSize: 15, fontWeight: '900' },
  emptyBox: { minHeight: 80, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: Spacing.three },
  emptyTxt: { flex: 1, color: '#AAB4C0', fontSize: 14, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#10161D', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', padding: 12 },
  dateBox: { width: 46, height: 48, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#151D25' },
  dateMonth: { color: '#16C784', fontSize: 10, fontWeight: '800' },
  dateDay: { color: '#F8FAFC', fontSize: 18, fontWeight: '900', marginTop: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  status: { color: '#16C784', fontSize: 10, fontWeight: '900' },
  cardType: { color: '#707B87', fontSize: 10, fontWeight: '700' },
  cardTitle: { color: '#F8FAFC', fontSize: 15, fontWeight: '800' },
  cardMeta: { color: '#AAB4C0', fontSize: 13, fontWeight: '700', marginTop: 3 },
});
