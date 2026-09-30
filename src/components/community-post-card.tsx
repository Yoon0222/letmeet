import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
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
        {post.is_pinned ? <View style={styles.pinned}><Ionicons name="pin" size={12} color="#16C784" /><Text style={styles.pinnedText}>고정</Text></View> : null}
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
        <View style={styles.authorWrap}>
          <Avatar nickname={post.author_nickname} uri={post.author_avatar_url} size={26} />
          <Text style={styles.author} numberOfLines={1}>{post.author_nickname}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.time}>{formatRelative(post.created_at)}</Text>
        </View>
        <View style={styles.metrics}>
          <Ionicons name="chatbubble-outline" size={16} color="#9CA3AF" />
          <Text style={styles.metric}>{post.comment_count}</Text>
          <Ionicons name="heart-outline" size={16} color="#9CA3AF" style={{ marginLeft: 12 }} />
          <Text style={styles.metric}>{post.like_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: Spacing.three,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pinnedText: { fontSize: 11, color: '#16C784', fontWeight: '800' },
  time: { fontSize: 12, color: '#707B87' },
  body: { flexDirection: 'row', gap: 12 },
  title: { fontSize: 17, fontWeight: '900', color: '#F8FAFC' },
  preview: { fontSize: 14, lineHeight: 20, color: '#AAB4C0', marginTop: 3 },
  thumb: { width: 82, height: 82, borderRadius: 8, borderCurve: 'continuous', backgroundColor: '#151D25' },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  authorWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  author: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: '#D7DCE2' },
  dot: { fontSize: 12, color: '#707B87' },
  metrics: { flexDirection: 'row', alignItems: 'center' },
  metric: { fontSize: 13, color: '#707B87', marginLeft: 3, fontWeight: '700' },
});
