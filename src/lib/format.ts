import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';
import { ko } from 'date-fns/locale';

import type { PlayStyle } from '@/lib/types';
import { PLAY_STYLE_LABELS } from '@/lib/types';

/** 모임 시작 시각을 사람이 읽기 좋은 한국어로 */
export function formatMeetupTime(iso: string): string {
  const d = new Date(iso);
  const time = format(d, 'a h:mm', { locale: ko });
  if (isToday(d)) return `오늘 ${time}`;
  if (isTomorrow(d)) return `내일 ${time}`;
  return format(d, 'M월 d일 (EEE) a h:mm', { locale: ko });
}

export function formatRelative(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { locale: ko, addSuffix: true });
}

export function playStyleLabel(style: PlayStyle): string {
  return PLAY_STYLE_LABELS[style] ?? style;
}

/** DUPR 스타일 실력 → 등급 라벨 */
export function skillLabel(level: number): string {
  if (level < 3.0) return '입문';
  if (level < 3.5) return '초급';
  if (level < 4.0) return '중급';
  if (level < 4.5) return '중상급';
  if (level < 5.0) return '상급';
  return '전문가';
}

export function skillRangeLabel(min: number, max: number): string {
  if (min <= 2.0 && max >= 8.0) return '실력 무관';
  return `${min.toFixed(1)} ~ ${max.toFixed(1)}`;
}
