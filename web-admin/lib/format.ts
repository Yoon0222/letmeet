import type { EntryStatus, TournamentStatus } from './types';

export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const TOURNAMENT_STATUS_LABEL: Record<TournamentStatus, string> = {
  registration: '접수중',
  ongoing: '진행중',
  finished: '종료',
  cancelled: '취소됨',
};

export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  pending: '승인대기',
  approved: '승인',
  rejected: '거절',
  withdrawn: '철회',
  waitlist: '대기열',
};

export function skillRange(min: number, max: number): string {
  if (min <= 2.0 && max >= 8.0) return '실력 무관';
  return `${min.toFixed(1)} ~ ${max.toFixed(1)}`;
}
