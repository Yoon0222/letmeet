import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import type { Court } from '@/lib/types';

export default function CourtListScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [rows, setRows] = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('courts').select('*').order('region', { ascending: true });
    if (error) {
      console.warn('[courts] load error', error.message);
      setRows([]);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Stack.Screen options={{ title: '코트 예약' }} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>코트 예약</Text>
        <Text style={[styles.sub, { color: theme.textSecondary }]}>가까운 코트를 찾아 시간을 예약하세요</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/court/${item.id}`)}
              style={({ pressed }) => [
                styles.card,
                { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
              ]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
                  {item.region || '지역 미설정'} · {item.indoor ? '실내' : '실외'} · {item.open_hour}–{item.close_hour}시
                </Text>
                <Text style={[styles.price, { color: theme.primary }]}>
                  {item.hourly_price > 0 ? `시간당 ${item.hourly_price.toLocaleString()}원` : '무료'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </Pressable>
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
              <Ionicons name="location-outline" size={48} color={theme.tabIconDefault} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>등록된 코트가 없어요</Text>
              <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>코트가 등록되면 여기에 표시됩니다.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  list: { padding: Spacing.four, paddingTop: 0, gap: Spacing.three, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: Spacing.three },
  name: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 3 },
  price: { fontSize: 14, fontWeight: '700', marginTop: 6 },
  empty: { alignItems: 'center', gap: 8, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14 },
});
