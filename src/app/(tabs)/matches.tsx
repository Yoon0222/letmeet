import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MeetupCard } from '@/components/meetup-card';
import { AppChip } from '@/components/ui/app-chip';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { MeetupWithCounts } from '@/lib/types';

export default function MatchesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [meetups, setMeetups] = useState<MeetupWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [kind, setKind] = useState<'normal' | 'dupr'>('normal'); // 일반 매치 / DUPR 매치 탭

  const load = useCallback(async () => {
    const [{ data, error }, blocked] = await Promise.all([
      supabase
        .from('meetups_with_counts')
        .select('*')
        .neq('status', 'cancelled') // 취소된 모임은 목록에서 숨김
        .eq('match_count', 0) // 경기 기록이 입력된(끝난) 모임도 숨김 (0087)
        .gte('start_time', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('start_time', { ascending: true })
        .limit(100),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
    ]);
    if (error) {
      console.warn('[matches] load error', error.message);
      setMeetups([]);
    } else {
      const blockedSet = new Set(blocked);
      setMeetups((data ?? []).filter((m) => !blockedSet.has(m.host_id)));
    }
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const regions = Array.from(new Set(meetups.map((m) => m.region).filter(Boolean)));
  const regionFiltered = region ? meetups.filter((m) => m.region === region) : meetups;

  // 일반 매치 / DUPR 매치 탭 분리
  const duprList = regionFiltered.filter((m) => m.dupr_certified);
  const normalList = regionFiltered.filter((m) => !m.dupr_certified);
  const visible = kind === 'dupr' ? duprList : normalList;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader title="번개 모임" subtitle="가까운 코트에서 함께 칠 사람을 찾아보세요" />
      </View>

      {/* 일반 매치 / DUPR 매치 탭 */}
      <View style={styles.kindTabs}>
        <Pressable
          onPress={() => setKind('normal')}
          style={[styles.kindTab, kind === 'normal' && styles.kindTabActive]}>
          <Ionicons name="flash" size={15} color={kind === 'normal' ? '#07100D' : '#AAB4C0'} />
          <Text style={[styles.kindTabText, kind === 'normal' && styles.kindTabTextActive]}>
            일반 매치 {normalList.length}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setKind('dupr')}
          style={[styles.kindTab, kind === 'dupr' && styles.kindTabActiveDupr]}>
          <Ionicons name="shield-checkmark" size={15} color={kind === 'dupr' ? '#FFFFFF' : '#AAB4C0'} />
          <Text style={[styles.kindTabText, kind === 'dupr' && styles.kindTabTextActiveDupr]}>
            DUPR 매치 {duprList.length}
          </Text>
        </Pressable>
      </View>

      {regions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chips}>
          <AppChip label="전체" active={region === null} onPress={() => setRegion(null)} />
          {regions.map((r) => (
            <AppChip key={r} label={r} active={region === r} onPress={() => setRegion(r)} />
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.itemWrap}>
              <MeetupCard meetup={item} onPress={() => router.push(`/meetup/${item.id}`)} />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name={kind === 'dupr' ? 'shield-checkmark-outline' : 'flash-outline'} size={48} color="#707B87" />
              <Text style={styles.emptyTitle}>{kind === 'dupr' ? 'DUPR 매치가 없어요' : '일반 매치가 없어요'}</Text>
              <Text style={styles.emptyBody}>
                {kind === 'dupr' ? 'DUPR 인증 번개를 만들어 공식 레이팅 경기를 열어보세요.' : '첫 번개 모임을 만들어보세요.'}
              </Text>
            </View>
          }
        />
      )}

      <AppFAB
        onPress={() => router.push(session ? '/meetup/create' : '/(auth)/sign-in')}
        style={[styles.fab, { bottom: 86 + Math.max(insets.bottom, 16) }]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: Spacing.four, gap: 8, paddingBottom: Spacing.three, alignItems: 'center' },
  list: { padding: Spacing.four, paddingTop: 0, paddingBottom: 124 },
  itemWrap: { marginBottom: Spacing.three },
  kindTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  kindTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  kindTabActive: { backgroundColor: '#16C784', borderColor: '#16C784' },
  kindTabActiveDupr: { backgroundColor: '#2D6BD6', borderColor: '#2D6BD6' },
  kindTabText: { fontSize: 14, fontWeight: '800', color: '#AAB4C0' },
  kindTabTextActive: { color: '#07100D' },
  kindTabTextActiveDupr: { color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  emptyBody: { fontSize: 16, color: '#AAB4C0' },
  fab: {
    position: 'absolute',
    right: Spacing.four,
  },
});
