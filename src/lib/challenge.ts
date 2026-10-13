// 번개 완료·출석 확정과 챌린지(이벤트) — 표시용 도우미와 서버 호출 (0099).
//   앱은 완료·출석 표에 직접 쓰지 않는다(서버가 거절한다). 완료 처리는 meetup_complete 함수,
//   횟수 집계는 challenge_progress / challenge_entries 함수가 서버에서 한다. 앱은 결과를 보여줄 뿐이다.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import type {
  AttendanceStatus,
  Challenge,
  ChallengeEntry,
  ChallengeEntryReason,
  ChallengeProgress,
  MeetupAttendance,
  MeetupCompletion,
} from '@/lib/types';

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: '참석', absent: '불참', unknown: '미확인' };

const KST_OFFSET_MS = 9 * 3600000;

/** 한국 날짜 'YYYY-MM-DD' (기기 시간대와 무관) */
export function kstDate(ms: number): string {
  return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' 또는 시각(ISO) → 'M월 D일' (한국 날짜 기준) */
export function kstDayLabel(value: string): string {
  const ymd = value.length > 10 ? kstDate(new Date(value).getTime()) : value;
  const [, mm, dd] = ymd.split('-');
  return `${Number(mm)}월 ${Number(dd)}일`;
}

/** 시각(ISO) → 'M월 D일 HH:MM' (한국 시간) */
export function kstDateTimeLabel(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString();
  return `${kstDayLabel(shifted.slice(0, 10))} ${shifted.slice(11, 16)}`;
}

/** 챌린지 기간: '10월 20일 ~ 11월 30일' */
export function challengePeriodLabel(c: Pick<Challenge, 'starts_at' | 'ends_at'>): string {
  return `${kstDayLabel(c.starts_at)} ~ ${kstDayLabel(c.ends_at)}`;
}

/** 남은 기간: '종료' / '오늘 마감' / 'N일 남음' (한국 날짜 기준) */
export function challengeRemainingLabel(c: Pick<Challenge, 'ends_at'>, nowMs: number): string {
  const endMs = new Date(c.ends_at).getTime();
  if (nowMs > endMs) return '종료';
  const days = Math.round((Date.parse(`${kstDate(endMs)}T00:00:00Z`) - Date.parse(`${kstDate(nowMs)}T00:00:00Z`)) / 86400000);
  return days <= 0 ? '오늘 마감' : `${days}일 남음`;
}

/** 지금 완료 처리하면 인정되는 기간인가(종료 + 유예 일수까지) */
export function challengeAcceptsCompletion(c: Pick<Challenge, 'starts_at' | 'ends_at' | 'completion_grace_days'>, nowMs: number): boolean {
  return nowMs >= new Date(c.starts_at).getTime() && nowMs <= new Date(c.ends_at).getTime() + c.completion_grace_days * 86400000;
}

/** 하루 인정 한도 안내: '하루 최대 1회 인정' */
export function dailyLimitLabel(c: Pick<Challenge, 'daily_limit'>): string {
  return `하루 최대 ${c.daily_limit}회 인정`;
}

/** 인정되지 않은 기록의 사유 */
export function entryReasonLabel(reason: ChallengeEntryReason, dailyLimit: number): string {
  switch (reason) {
    case 'daily_limit':
      return dailyLimit === 1 ? '같은 날 이미 1회가 인정됐어요' : `같은 날 이미 ${dailyLimit}회가 인정됐어요`;
    case 'absent':
      return '불참으로 처리됐어요';
    case 'unknown':
      return '호스트가 참석을 확인하지 않았어요';
    case 'too_few':
      return '참석자가 2명보다 적었어요';
    case 'before_join':
      return '참여 신청 전의 기록이에요';
    case 'voided':
      return '운영자가 완료를 취소한 모임이에요';
    case 'cancelled':
      return '취소된 모임이에요';
  }
}

// ── 번개 완료·출석 ──────────
/**
 * 번개 완료 기록. 아직 완료 처리 전이면 null.
 * 조회에 실패하면(서버에 이 기능이 아직 없을 때 포함) undefined — 이때는 완료 관련 화면을 보여주지 않는다.
 */
export async function fetchMeetupCompletion(meetupId: string): Promise<MeetupCompletion | null | undefined> {
  const { data, error } = await supabase.from('meetup_completions').select('*').eq('meetup_id', meetupId).maybeSingle();
  if (error) return undefined;
  return (data as MeetupCompletion | null) ?? null;
}

/** 출석 기록. 서버가 내 것(호스트면 그 번개 전원)만 돌려준다. 실패하면 빈 배열. */
export async function fetchMeetupAttendance(meetupId: string): Promise<MeetupAttendance[]> {
  const { data, error } = await supabase.from('meetup_attendance').select('*').eq('meetup_id', meetupId);
  if (error) return [];
  return (data as MeetupAttendance[] | null) ?? [];
}

const COMPLETE_ERRORS: Record<string, string> = {
  not_found: '모임을 찾을 수 없어요.',
  forbidden: '호스트만 완료 처리할 수 있어요.',
  cancelled: '취소된 모임은 완료 처리할 수 없어요.',
  not_started: '모임 시작 시간이 지난 뒤에 완료 처리할 수 있어요.',
  already_completed: '이미 완료 처리된 모임이에요.',
  voided: '운영자가 완료를 취소한 모임이에요. 다시 처리하려면 고객지원으로 문의해주세요.',
  invalid_member: '참가자 구성이 바뀌었어요. 화면을 새로 고친 뒤 다시 선택해주세요.',
  need_two: '참석자가 2명 이상이어야 완료할 수 있어요.',
};

export type CompleteMeetupResult = { ok: true } | { ok: false; code: string; error: string };

/** 번개 완료 처리(호스트). 참석·불참으로 고르지 않은 승인 참가자는 '미확인'으로 남는다. */
export async function completeMeetup(meetupId: string, present: string[], absent: string[]): Promise<CompleteMeetupResult> {
  const { data, error } = await supabase.rpc('meetup_complete', { p_meetup_id: meetupId, p_present: present, p_absent: absent });
  if (error || !data) return { ok: false, code: 'network', error: '완료 처리하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.' };
  if (data !== 'ok') return { ok: false, code: data, error: COMPLETE_ERRORS[data] ?? '완료 처리하지 못했어요.' };
  return { ok: true };
}

// ── 챌린지 ──────────
/**
 * 지금 보여줄 챌린지: 켜져 있고 이미 시작한 것. 끝난 뒤에는 visible_days_after_end 일 동안만 '종료'로 보이고 그 뒤에는
 * 저절로 사라진다(운영자가 따로 끄지 않아도 된다).
 * 실패하면(서버에 기능이 아직 없을 때 포함) 빈 배열 → 카드·메뉴가 보이지 않을 뿐이다.
 */
export async function fetchActiveChallenges(): Promise<Challenge[]> {
  const nowMs = Date.now();
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('active', true)
    .lte('starts_at', new Date(nowMs).toISOString())
    .order('starts_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return ((data as Challenge[] | null) ?? [])
    .filter((c) => nowMs <= new Date(c.ends_at).getTime() + (c.visible_days_after_end ?? 7) * 86400000)
    .slice(0, 3);
}

/** 챌린지 한 건. 없으면(꺼짐 포함) null, 조회에 실패하면 undefined — "없음"과 "못 읽음"을 구분해서 보여줄 것. */
export async function fetchChallenge(challengeId: string): Promise<Challenge | null | undefined> {
  const { data, error } = await supabase.from('challenges').select('*').eq('id', challengeId).maybeSingle();
  if (error) return undefined;
  return (data as Challenge | null) ?? null;
}

export type PendingCompletion = { id: string; title: string; start_time: string };

/**
 * 내가 호스트인데 아직 완료 처리하지 않은 번개(시작 시간이 지난 것, 취소 아님). 최근 것부터.
 * 시작하고 몇 시간이 지난 번개는 목록 화면에서 사라지므로, 호스트가 완료 처리 화면으로 가는 길을 따로 준다.
 */
export async function fetchPendingCompletions(hostId: string, sinceIso: string): Promise<PendingCompletion[]> {
  const { data: rows, error } = await supabase
    .from('meetups')
    .select('id, title, start_time')
    .eq('host_id', hostId)
    .neq('status', 'cancelled')
    .gte('start_time', sinceIso)
    .lte('start_time', new Date().toISOString())
    .order('start_time', { ascending: false })
    .limit(20);
  if (error || !rows || rows.length === 0) return [];
  const list = rows as PendingCompletion[];
  const { data: done, error: doneError } = await supabase
    .from('meetup_completions')
    .select('meetup_id')
    .in('meetup_id', list.map((m) => m.id));
  if (doneError) return []; // 완료 여부를 모르면 "완료 처리할 모임"이라고 안내하지 않는다
  const completed = new Set(((done as { meetup_id: string | null }[] | null) ?? []).map((d) => d.meetup_id));
  return list.filter((m) => !completed.has(m.id));
}

/** 내 진행률(서버 계산) + 참여 신청 여부·내 인스타그램 아이디. 신청 전이어도 enrolled=false 로 온다. 못 읽으면 null. */
export async function fetchChallengeProgress(challengeId: string): Promise<ChallengeProgress | null> {
  const { data, error } = await supabase.rpc('challenge_progress', { p_challenge_id: challengeId });
  if (error) return null;
  return (data as ChallengeProgress[] | null)?.[0] ?? null;
}

/** 내 인정 내역(최근 순). 조회에 실패하면 예외 — "기록 없음"과 구분해서 보여줄 것. */
export async function fetchChallengeEntries(challengeId: string): Promise<ChallengeEntry[]> {
  const { data, error } = await supabase.rpc('challenge_entries', { p_challenge_id: challengeId });
  if (error) throw new Error(`challenge_load_failed: ${error.message}`);
  return (data as ChallengeEntry[] | null) ?? [];
}

// ── 참여 신청 (인스타그램 아이디 등록) ──────────
/**
 * 입력한 인스타그램 아이디 다듬기 — 서버(normalize_instagram_id)와 같은 규칙.
 * 앞의 '@', 프로필 주소(instagram.com/아이디), 대문자를 정리한다. 형식이 아니면 null.
 */
export function normalizeInstagramId(input: string): string | null {
  const v = input
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/)?(www\.|m\.)?instagram\.com\//, '') // 프로필 주소(앞의 http·www 는 없어도 된다)
    .replace(/[/?#].*$/, '')
    .replace(/^@+/, '');
  if (!/^[a-z0-9._]{1,30}$/.test(v)) return null;
  // 게시물·릴스 주소 등을 붙여 넣었을 때 남는 경로 이름은 아이디가 아니다
  if (INSTAGRAM_NOT_AN_ID.has(v)) return null;
  return v;
}
const INSTAGRAM_NOT_AN_ID = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'instagram.com', 'www.instagram.com']);

const JOIN_ERRORS: Record<string, string> = {
  forbidden: '로그인한 뒤 다시 시도해주세요.',
  not_found: '지금은 참여할 수 없는 이벤트예요.',
  ended: '이벤트가 끝나 참여 신청을 받지 않아요.',
  invalid_instagram: '인스타그램 아이디를 확인해주세요. 영문·숫자·밑줄(_)·마침표(.)만, 30자까지 쓸 수 있어요.',
  instagram_taken: '다른 계정이 이미 등록한 인스타그램 아이디예요.',
};

export type ChallengeActionResult = { ok: true } | { ok: false; code: string; error: string };

/** 참여 신청(인스타그램 아이디 등록). 이미 신청했으면 아이디만 바뀐다(신청 시각은 그대로). */
export async function joinChallenge(challengeId: string, instagramId: string): Promise<ChallengeActionResult> {
  const { data, error } = await supabase.rpc('challenge_join', { p_challenge_id: challengeId, p_instagram_id: instagramId });
  if (error || !data) return { ok: false, code: 'network', error: '참여 신청을 보내지 못했어요. 네트워크를 확인하고 다시 시도해주세요.' };
  if (data !== 'ok' && data !== 'updated') return { ok: false, code: data, error: JOIN_ERRORS[data] ?? '참여 신청을 하지 못했어요.' };
  return { ok: true };
}

/** 참여 취소. 지금까지의 기록이 이 이벤트에서 빠지고, 다시 신청하면 그때부터 새로 인정된다. */
export async function leaveChallenge(challengeId: string): Promise<ChallengeActionResult> {
  const { data, error } = await supabase.rpc('challenge_leave', { p_challenge_id: challengeId });
  if (error || !data) return { ok: false, code: 'network', error: '참여 취소를 보내지 못했어요. 네트워크를 확인하고 다시 시도해주세요.' };
  if (data === 'ended') return { ok: false, code: data, error: '끝난 이벤트는 참여를 취소할 수 없어요. 필요하면 고객지원으로 문의해주세요.' };
  if (data !== 'ok' && data !== 'not_found') return { ok: false, code: data, error: '참여를 취소하지 못했어요.' };
  return { ok: true };
}

// 홈의 참여 안내 카드 "다시 보지 않기" — 이 기기에, 계정별로 저장한다(전체 탭의 이벤트 메뉴로는 언제든 들어갈 수 있다)
const hiddenKey = (userId: string, challengeId: string) => `challenge_card_hidden:${userId}:${challengeId}`;

export async function isChallengeCardHidden(userId: string, challengeId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(hiddenKey(userId, challengeId))) === '1';
  } catch {
    return false;
  }
}

export async function hideChallengeCard(userId: string, challengeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(hiddenKey(userId, challengeId), '1');
  } catch {
    // 저장에 실패해도 이번 화면에서는 숨긴다
  }
}
