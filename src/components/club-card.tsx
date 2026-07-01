import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ClubWithCounts } from '@/lib/types';

export function ClubCard({ club, onPress }: { club: ClubWithCounts; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.9 : 1 },
      ]}>
      <View style={[styles.icon, { backgroundColor: 'rgba(61,186,111,0.14)' }]}>
        <Ionicons name="people" size={22} color={theme.primary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {club.name}
        </Text>
        <View style={styles.metaRow}>
          {club.region ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={1}>
              {club.region}
            </Text>
          ) : null}
          <View style={styles.dot} />
          <Ionicons name="person-outline" size={13} color={theme.textSecondary} />
          <Text style={[styles.meta, { color: theme.textSecondary }]}>멤버 {club.member_count}</Text>
        </View>
      </View>
      <Avatar nickname={club.owner_nickname} uri={club.owner_avatar_url} size={28} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
    borderRadius: 14,
    borderWidth: 1,
  },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { fontSize: 13 },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#8A9099' },
});
