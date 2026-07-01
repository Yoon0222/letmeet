import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import { playStyleLabel, skillLabel } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

export default function MatchesScreen() {
  const theme = useTheme();
  const { session, profile } = useAuth();
  const [players, setPlayers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mySkill = profile?.skill_level ?? 3.5;
  const myRegion = profile?.region ?? '';

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', session?.user.id ?? '')
      .limit(200);
    if (error) {
      console.warn('[matches] load error', error.message);
      setPlayers([]);
    } else {
      // 같은 지역 우선 + 실력 근접 순으로 정렬 (추천 점수)
      const scored = (data ?? []).slice().sort((a, b) => score(a) - score(b));
      setPlayers(scored);
    }
    setLoading(false);
    setRefreshing(false);

    function score(p: Profile) {
      const skillDiff = Math.abs(p.skill_level - mySkill);
      const regionPenalty = myRegion && p.region === myRegion ? 0 : 2;
      return skillDiff + regionPenalty;
    }
  }, [session?.user.id, mySkill, myRegion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>플레이어 매칭</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>
          {myRegion ? `${myRegion} · ` : ''}내 실력 {mySkill.toFixed(1)} 기준 추천 순
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={players}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
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
          renderItem={({ item }) => (
            <PlayerRow player={item} sameRegion={!!myRegion && item.region === myRegion} theme={theme} />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color={theme.tabIconDefault} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>아직 다른 플레이어가 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
                친구를 초대해 함께 시작해보세요!
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function PlayerRow({
  player,
  sameRegion,
  theme,
}: {
  player: Profile;
  sameRegion: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Avatar nickname={player.nickname} uri={player.avatar_url} size={48} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
            {player.nickname}
          </Text>
          {sameRegion && <Badge label="같은 지역" />}
        </View>
        <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {player.region || '지역 미설정'} · {playStyleLabel(player.play_style)}
        </Text>
      </View>
      <View style={styles.skillBox}>
        <Text style={[styles.skillNum, { color: theme.primary }]}>
          {player.skill_level.toFixed(1)}
        </Text>
        <Text style={[styles.skillLabel, { color: theme.textSecondary }]}>
          {skillLabel(player.skill_level)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  list: { padding: Spacing.four, paddingTop: 0, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13 },
  skillBox: { alignItems: 'center', minWidth: 48 },
  skillNum: { fontSize: 20, fontWeight: '800' },
  skillLabel: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14 },
});
