import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClubCard } from '@/components/club-card';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { ClubWithCounts } from '@/lib/types';

export default function ClubsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [clubs, setClubs] = useState<ClubWithCounts[]>([]);
  const [myClubIds, setMyClubIds] = useState<Set<string>>(new Set());
  const [pendingClubIds, setPendingClubIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const openCreateClub = useCallback(() => {
    router.push(session ? '/club/create' : '/(auth)/sign-in');
  }, [router, session]);

  const load = useCallback(async () => {
    const [{ data, error }, blocked, { data: myMem }] = await Promise.all([
      supabase.from('clubs_with_counts').select('*').order('member_count', { ascending: false }).limit(100),
      uid ? getBlockedIds(uid) : Promise.resolve([]),
      uid
        ? supabase.from('club_members').select('club_id, status').eq('user_id', uid)
        : Promise.resolve({ data: [] as { club_id: string; status: string }[] }),
    ]);
    if (error) {
      console.warn('[clubs] load error', error.message);
      setClubs([]);
    } else {
      const blockedSet = new Set(blocked);
      setClubs((data ?? []).filter((c) => !blockedSet.has(c.owner_id))); // 차단한 사용자 클럽 숨김
    }
    const mem = (myMem as { club_id: string; status: string }[] | null) ?? [];
    setMyClubIds(new Set(mem.filter((m) => m.status === 'approved').map((m) => m.club_id)));
    setPendingClubIds(new Set(mem.filter((m) => m.status === 'pending').map((m) => m.club_id)));
    setLoading(false);
    setRefreshing(false);
  }, [uid]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // 이름·지역 검색
  const q = query.trim().toLowerCase();
  const visible = q
    ? clubs.filter((c) => `${c.name} ${c.region}`.toLowerCase().includes(q))
    : clubs;

  // 내 클럽(가입·소유) → 가입 신청 중 → 다른 클럽 순으로 분리
  const myClubs = visible.filter((c) => myClubIds.has(c.id));
  const pendingClubs = visible.filter((c) => pendingClubIds.has(c.id) && !myClubIds.has(c.id));
  const otherClubs = visible.filter((c) => !myClubIds.has(c.id) && !pendingClubIds.has(c.id));
  const groups = [
    { title: '내 클럽', data: myClubs },
    { title: '가입 신청 중', data: pendingClubs },
    { title: '다른 클럽', data: otherClubs },
  ].filter((g) => g.data.length > 0);
  // 그룹이 하나뿐이면 헤더 숨김(예: 안 가입한 사용자)
  const sections = groups.map((g) => ({ ...g, showHeader: groups.length > 1 }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader
          title="클럽"
          subtitle="함께 꾸준히 칠 동호회를 찾거나 만들어보세요"
          rightIcon="add"
          onRightPress={openCreateClub}
          onBack={router.canGoBack() ? () => router.back() : undefined}
        />
      </View>

      {!loading && clubs.length > 0 ? (
        <View style={styles.searchWrap}>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color="#707B87" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="클럽 이름·지역 검색"
              placeholderTextColor="#707B87"
              style={styles.searchInput}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color="#707B87" />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.cardWrap}>
              <ClubCard club={item} onPress={() => router.push(`/club/${item.id}`)} />
            </View>
          )}
          renderSectionHeader={({ section }) =>
            section.showHeader ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
          }
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
              <Ionicons name={q ? 'search' : 'people-outline'} size={48} color="#707B87" />
              <Text style={styles.emptyTitle}>{q ? '검색 결과가 없어요' : '아직 클럽이 없어요'}</Text>
              <Text style={styles.emptyBody}>{q ? '다른 이름·지역으로 검색해보세요.' : '첫 번째 클럽을 만들어보세요.'}</Text>
              {!q ? (
                <Pressable onPress={openCreateClub} style={styles.emptyButton}>
                  <Ionicons name="add" size={16} color="#07110C" />
                  <Text style={styles.emptyButtonText}>클럽 만들기</Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      )}

      <AppFAB
        onPress={openCreateClub}
        style={[styles.fab, { bottom: 86 + Math.max(insets.bottom, 16) }]}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A0D' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  searchWrap: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: '#10161D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0, color: '#F8FAFC' },
  list: { padding: Spacing.four, paddingTop: 0, paddingBottom: 124 },
  cardWrap: { marginBottom: Spacing.three },
  sectionHeader: { fontSize: 15, fontWeight: '900', color: '#F8FAFC', marginTop: Spacing.two, marginBottom: Spacing.three },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#F8FAFC' },
  emptyBody: { fontSize: 16, color: '#AAB4C0' },
  emptyButton: {
    minHeight: 48,
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#9BE137',
    paddingHorizontal: Spacing.three,
  },
  emptyButtonText: { color: '#07110C', fontSize: 14, fontWeight: '900' },
  fab: { position: 'absolute', right: Spacing.four },
});
