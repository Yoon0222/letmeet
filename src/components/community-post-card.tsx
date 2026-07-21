import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { categoryMeta } from '@/lib/community';
import { formatRelative } from '@/lib/format';
import type { CommunityPostWithCounts } from '@/lib/types';

// 커뮤니티 글 카드 — 목록에서 사용. 카테고리 배지·제목·미리보기·썸네일·작성자·좋아요/댓글수.
export function CommunityPostCard({
  post,
  onPress,
}: {
  post: CommunityPostWithCounts;
  onPress: () => void;
}) {
  const cat = categoryMeta(post.category);
  const cover = post.images?.[0];

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: cat.bg }]}>
          <Ionicons name={cat.icon} size={12} color={cat.color} />
          <Text style={[styles.badgeText, { color: cat.color }]}>{cat.label}</Text>
        </View>
        <Text style={styles.time}>{formatRelative(post.created_at)}</Text>
      </View>

      <View style={styles.body}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>
            {post.title}
          </Text>
          {post.body ? (
            <Text style={styles.preview} numberOfLines={2}>
              {post.body}
            </Text>
          ) : null}
        </View>
        {cover ? <Image source={{ uri: cover }} style={styles.thumb} /> : null}
      </View>

      <View style={styles.foot}>
        <Text style={styles.author} numberOfLines={1}>
          {post.author_nickname}
        </Text>
        <View style={styles.metrics}>
          <Ionicons name="heart-outline" size={14} color="#9CA3AF" />
          <Text style={styles.metric}>{post.like_count}</Text>
          <Ionicons name="chatbubble-outline" size={14} color="#9CA3AF" style={{ marginLeft: 10 }} />
          <Text style={styles.metric}>{post.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: '#EEF0F2',
    padding: Spacing.three,
    gap: 10,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  time: { fontSize: 12, color: '#9CA3AF' },
  body: { flexDirection: 'row', gap: 12 },
  title: { fontSize: 16, fontWeight: '800', color: '#111827' },
  preview: { fontSize: 14, lineHeight: 20, color: '#6B7280', marginTop: 3 },
  thumb: { width: 64, height: 64, borderRadius: 12, borderCurve: 'continuous', backgroundColor: '#F3F4F6' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  author: { flex: 1, fontSize: 13, fontWeight: '600', color: '#6B7280' },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { fontSize: 13, color: '#9CA3AF', marginLeft: 3, fontWeight: '600' },
});
