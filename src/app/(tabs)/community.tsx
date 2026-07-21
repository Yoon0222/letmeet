import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CommunityPostCard } from '@/components/community-post-card';
import { AppFAB } from '@/components/ui/app-fab';
import { AppHeader } from '@/components/ui/app-header';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { COMMUNITY_CATEGORIES } from '@/lib/community';
import { getBlockedIds } from '@/lib/moderation';
import { supabase } from '@/lib/supabase';
import type { CommunityCategory, CommunityPostWithCounts } from '@/lib/types';

export default function CommunityScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const uid = session?.user.id;
  const [posts, setPosts] = useState<CommunityPostWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cat, setCat] = useState<CommunityCategory | 'all'>('all');

  const load = useCallback(async () => {
    let q = supabase
      .from('community_posts_with_counts')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (cat !== 'all') q = q.eq('category', cat);
    const [{ data, error }, blocked] = await Promise.all([q, uid ? getBlockedIds(uid) : Promise.resolve([])]);
    if (error) {
      console.warn('[community] load error', error.message);
      setPosts([]);
    } else {
      const blockedSet = new Set(blocked);
      setPosts((data ?? []).filter((p) => !blockedSet.has(p.author_id))); // 차단 사용자 글 숨김
    }
    setLoading(false);
    setRefreshing(false);
  }, [uid, cat]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <AppHeader title="커뮤니티" subtitle="자유롭게 이야기하고 정보를 나눠보세요" />
      </View>

      {/* 카테고리 필터 */}
      <View style={styles.chipsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <FilterChip label="전체" active={cat === 'all'} onPress={() => setCat('all')} />
          {COMMUNITY_CATEGORIES.map((c) => (
            <FilterChip key={c.key} label={c.label} active={cat === c.key} onPress={() => setCat(c.key)} />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CommunityPostCard post={item} onPress={() => router.push(`/community/${item.id}` as never)} />
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
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#9CA3AF" />
              <Text style={styles.emptyTitle}>아직 글이 없어요</Text>
              <Text style={styles.emptyBody}>첫 번째 글을 남겨보세요.</Text>
            </View>
          }
        />
      )}

      <AppFAB icon="create" onPress={() => router.push(session ? ('/community/create' as never) : '/(auth)/sign-in')} style={styles.fab} />
    </SafeAreaView>
  );
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F6F7F9' },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.two },
  chipsWrap: { paddingBottom: Spacing.two },
  chips: { paddingHorizontal: Spacing.four, gap: 8 },
  chip: {
    height: 36,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#16C784', borderColor: '#16C784' },
  chipText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  chipTextActive: { color: '#FFFFFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 100 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  emptyBody: { fontSize: 16, color: '#6B7280' },
  fab: { position: 'absolute', right: Spacing.four, bottom: Spacing.four },
});
