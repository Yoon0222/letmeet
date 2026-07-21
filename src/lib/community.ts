// 커뮤니티 카테고리 메타 (라벨·아이콘·색). 목록 필터·글카드·작성 화면 공용.
import type { Ionicons } from '@expo/vector-icons';

import type { CommunityCategory } from '@/lib/types';

export type CategoryMeta = {
  key: CommunityCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string; // 아이콘·배지 전경색
  bg: string; // 배지 배경색
};

export const COMMUNITY_CATEGORIES: CategoryMeta[] = [
  { key: 'free', label: '자유', icon: 'chatbubbles-outline', color: '#16A34A', bg: '#E7F6EC' },
  { key: 'question', label: '질문', icon: 'help-circle-outline', color: '#2563EB', bg: '#E8F0FE' },
  { key: 'market', label: '장터', icon: 'pricetag-outline', color: '#EA580C', bg: '#FCEEE2' },
  { key: 'review', label: '후기', icon: 'star-outline', color: '#D97706', bg: '#FEF3C7' },
  { key: 'tip', label: '팁·정보', icon: 'bulb-outline', color: '#7C3AED', bg: '#F0E9FE' },
];

const BY_KEY: Record<CommunityCategory, CategoryMeta> = COMMUNITY_CATEGORIES.reduce(
  (acc, c) => ({ ...acc, [c.key]: c }),
  {} as Record<CommunityCategory, CategoryMeta>,
);

export function categoryMeta(key: CommunityCategory): CategoryMeta {
  return BY_KEY[key] ?? COMMUNITY_CATEGORIES[0];
}
