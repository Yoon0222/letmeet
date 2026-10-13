'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Modal } from '@/components/modal';
import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type {
  AttendanceStatus,
  Challenge,
  ChallengeEntry,
  ChallengeEntryReason,
  ChallengeParticipantRow,
  MeetupCompletion,
} from '@/lib/types';
import { useSession } from '@/lib/use-session';

// 챌린지(이벤트) 관리 — 설정, 참여 현황, 완료·출석 정정. 최고관리자 전용.
//   횟수는 서버가 출석 기록에서 계산한다(challenge_participants / challenge_entries). 이 화면은 설정을 바꾸고,
//   잘못된 완료·출석을 서버 함수(meetup_attendance_admin_set / meetup_completion_admin_set)로 정정할 뿐이다.

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500';
const KST_MS = 9 * 3600000;

// 모든 날짜·시각은 한국 시간(Asia/Seoul)으로 입력하고 보여준다 — 관리자 PC 의 시간대와 무관하게.
function toKstInput(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_MS).toISOString().slice(0, 19);
}
function fromKstInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(`${local.length === 16 ? `${local}:00` : local}+09:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function kstLabel(iso: string | null, withTime = true): string {
  if (!iso) return '-';
  const s = new Date(new Date(iso).getTime() + KST_MS).toISOString();
  return withTime ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s.slice(0, 10);
}

const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: '참석', absent: '불참', unknown: '미확인' };
const REASON_LABEL: Record<ChallengeEntryReason, string> = {
  daily_limit: '하루 한도 초과',
  absent: '불참',
  unknown: '참석 미확인',
  too_few: '참석자 2명 미만',
  before_join: '참여 신청 전',
  voided: '완료 무효',
  cancelled: '취소된 번개',
};
const ADMIN_ERRORS: Record<string, string> = {
  forbidden: '최고관리자만 할 수 있어요.',
  invalid: '값이 올바르지 않아요. (완료 처리 시각은 번개 시작 이후 ~ 지금 사이여야 해요)',
  not_found: '완료 기록을 찾을 수 없어요.',
  invalid_member: '이 번개의 승인 참가자가 아니에요.',
  cancelled: '무효로 둔 사이 호스트가 번개를 취소했어요. 취소된 번개는 인정되지 않아 무효를 되돌릴 수 없어요.',
};
const ENROLL_ERRORS: Record<string, string> = {
  forbidden: '최고관리자만 할 수 있어요.',
  invalid: '참여 신청 시각이 올바르지 않아요. (지금보다 뒤일 수 없어요)',
  not_found: '챌린지나 회원을 찾을 수 없어요.',
  invalid_instagram: '인스타그램 아이디 형식이 아니에요. (영문·숫자·밑줄·마침표, 30자 이하)',
  instagram_taken: '다른 사람이 이미 등록한 인스타그램 아이디예요.',
};

// 목록을 끝까지 읽는다(서버가 한 번에 주는 행 수에 제한이 있어, 나눠 받지 않으면 표시 없이 잘린다)
const PAGE = 1000;
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<{ rows: T[]; error: string }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    const chunk = (data as T[] | null) ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE) return { rows, error: '' };
  }
}
const chunks = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function statusOf(c: Challenge): { label: string; cls: string } {
  if (!c.active) return { label: '꺼짐', cls: 'bg-slate-100 text-slate-500' };
  const now = Date.now();
  if (new Date(c.starts_at).getTime() > now) return { label: '예정', cls: 'bg-sky-100 text-sky-700' };
  if (new Date(c.ends_at).getTime() < now) return { label: '종료', cls: 'bg-slate-100 text-slate-500' };
  return { label: '진행중', cls: 'bg-emerald-100 text-emerald-700' };
}

// 엑셀에서 수식으로 실행되지 않게 하고(=,+,-,@ 로 시작하는 값), 쉼표·따옴표·줄바꿈을 감싼다
function csvCell(v: string | number | null): string {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(filename: string, header: string[], lines: (string | number | null)[][]) {
  const csv = [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Form = {
  title: string;
  description: string;
  starts: string;
  ends: string;
  goal: string;
  daily: string;
  grace: string;
  visibleDays: string;
  active: boolean;
};

function emptyForm(): Form {
  // 새 챌린지 기본값: 오늘 0시(한국) 시작, 2026-11-30 23:59:59 종료(그 날짜가 지났으면 30일 뒤), 목표 10회, 하루 1회
  const now = Date.now();
  const today = new Date(now + KST_MS).toISOString().slice(0, 10);
  const defaultEnd = '2026-11-30T23:59:59';
  const ends = new Date(`${defaultEnd}+09:00`).getTime() > now ? defaultEnd : `${new Date(now + KST_MS + 30 * 86400000).toISOString().slice(0, 10)}T23:59:59`;
  return { title: '피넛 10매치 챌린지', description: '', starts: `${today}T00:00:00`, ends, goal: '10', daily: '1', grace: '3', visibleDays: '7', active: false };
}

function ChallengesInner() {
  const { session } = useSession();
  const [rows, setRows] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.from('challenges').select('*').order('starts_at', { ascending: false }).limit(100);
    setLoadError(err ? err.message : '');
    const list = (data as Challenge[] | null) ?? [];
    setRows(list);
    // 처음에는 진행 중인 것(없으면 가장 최근 것)의 참여 현황을 연다
    setSelectedId((prev) => (prev && list.some((c) => c.id === prev) ? prev : (list.find((c) => statusOf(c).label === '진행중') ?? list[0])?.id ?? null));
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setError('');
    setFormOpen(true);
  }
  function openEdit(c: Challenge) {
    setEditingId(c.id);
    setForm({
      title: c.title,
      description: c.description,
      starts: toKstInput(c.starts_at),
      ends: toKstInput(c.ends_at),
      goal: String(c.goal_count),
      daily: String(c.daily_limit),
      grace: String(c.completion_grace_days),
      visibleDays: String(c.visible_days_after_end),
      active: c.active,
    });
    setError('');
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const title = form.title.trim();
    const starts = fromKstInput(form.starts);
    const ends = fromKstInput(form.ends);
    const goal = Number(form.goal);
    const daily = Number(form.daily);
    const grace = Number(form.grace);
    const visibleDays = Number(form.visibleDays);
    if (!title) return setError('이벤트명을 입력해주세요.');
    if (title.length > 60) return setError('이벤트명은 60자까지 쓸 수 있어요.');
    if (!starts || !ends) return setError('시작일과 종료일을 입력해주세요.');
    if (new Date(starts) >= new Date(ends)) return setError('시작이 종료보다 빨라야 해요.');
    if (!Number.isInteger(goal) || goal < 1 || goal > 1000) return setError('목표 횟수는 1~1000 사이의 정수로 입력해주세요.');
    if (!Number.isInteger(daily) || daily < 1 || daily > 100) return setError('하루 인정 한도는 1~100 사이의 정수로 입력해주세요.');
    if (!Number.isInteger(grace) || grace < 0 || grace > 30) return setError('완료 처리 유예는 0~30일 사이의 정수로 입력해주세요.');
    if (!Number.isInteger(visibleDays) || visibleDays < 0 || visibleDays > 365) return setError('종료 후 노출 기간은 0~365일 사이의 정수로 입력해주세요.');

    setSaving(true);
    const payload = {
      title,
      description: form.description.trim(),
      starts_at: starts,
      ends_at: ends,
      goal_count: goal,
      daily_limit: daily,
      completion_grace_days: grace,
      visible_days_after_end: visibleDays,
      active: form.active,
    };
    const { data, error: err } = editingId
      ? await supabase.from('challenges').update(payload).eq('id', editingId).select('id').maybeSingle()
      : await supabase.from('challenges').insert({ ...payload, created_by: session?.user.id ?? null }).select('id').maybeSingle();
    setSaving(false);
    if (err) return setError(err.message);
    if (!data) return setError('저장되지 않았어요. 권한을 확인해주세요.');
    setSelectedId(data.id);
    closeForm();
    load();
  }

  async function toggleActive(c: Challenge) {
    const { error: err } = await supabase.from('challenges').update({ active: !c.active }).eq('id', c.id);
    if (err) return alert(`변경 실패: ${err.message}`);
    load();
  }

  async function onDelete(c: Challenge) {
    const { count, error: countErr } = await supabase.from('challenge_enrollments').select('user_id', { count: 'exact', head: true }).eq('challenge_id', c.id);
    if (countErr) return alert(`삭제 전 확인 실패: ${countErr.message}`);
    if ((count ?? 0) > 0) {
      return alert(`참여 신청자가 ${count}명 있어 삭제할 수 없어요.\n삭제하면 신청자와 인스타그램 아이디가 함께 사라지기 때문이에요. 숨기려면 '끄기'를 쓰세요.`);
    }
    if (!confirm(`'${c.title}' 챌린지를 삭제할까요?\n참여 신청자가 없는 챌린지예요. 번개 완료·출석 기록은 지워지지 않아요.`)) return;
    const { error: err } = await supabase.from('challenges').delete().eq('id', c.id);
    if (err) return alert(`삭제 실패: ${err.message}`);
    load();
  }

  const selected = rows.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">챌린지</h1>
          <p className="mt-1 text-sm text-slate-500">
            번개 참석 횟수로 달성하는 이벤트를 만들고, 참여 현황을 확인합니다. 회원이 앱에서 인스타그램 아이디를 등록해 참여 신청해야 집계되고, 횟수는 호스트가
            확정한 출석 기록에서 서버가 계산해요.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">
          ＋ 챌린지 추가
        </button>
      </div>

      <Modal open={formOpen} onClose={closeForm} title={editingId ? '챌린지 수정' : '새 챌린지'}>
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">이벤트명</span>
            <input className={inputCls} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={60} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">설명 (선택)</span>
            <textarea
              className={`${inputCls} min-h-20`}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="앱의 이벤트 상세 '참여 방법' 위에 보여줄 안내(경품 등)"
              maxLength={300}
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">시작 (한국 시간)</span>
              <input type="datetime-local" step={1} className={inputCls} value={form.starts} onChange={(e) => set('starts', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">종료 (한국 시간)</span>
              <input type="datetime-local" step={1} className={inputCls} value={form.ends} onChange={(e) => set('ends', e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">목표 횟수</span>
              <input type="number" min={1} max={1000} className={inputCls} value={form.goal} onChange={(e) => set('goal', e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">하루 인정 한도</span>
              <input type="number" min={1} max={100} className={inputCls} value={form.daily} onChange={(e) => set('daily', e.target.value)} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">완료 처리 유예 (일)</span>
              <input type="number" min={0} max={30} className={inputCls} value={form.grace} onChange={(e) => set('grace', e.target.value)} />
              <span className="mt-1 block text-xs text-slate-400">종료 전에 열린 번개를 호스트가 종료 뒤 며칠 안에 완료 처리하면 인정해요. 0이면 종료 시각까지만.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">종료 후 앱 노출 (일)</span>
              <input type="number" min={0} max={365} className={inputCls} value={form.visibleDays} onChange={(e) => set('visibleDays', e.target.value)} />
              <span className="mt-1 block text-xs text-slate-400">종료 뒤 이 기간이 지나면 앱의 카드·메뉴가 저절로 사라져요(따로 끄지 않아도 돼요).</span>
            </label>
          </div>
          <p className="text-xs text-slate-400">
            참여 신청한 회원만, 신청한 뒤에 완료 처리된 참석만 인정돼요. 번개는 시작~종료 사이에 열린 것만 해당돼요. 인정 날짜는 완료 처리한 날(한국 날짜)이고,
            하루 한도는 완료 처리한 날과 번개가 열린 날 둘 다에 적용돼요(같은 날 친 번개를 다른 날에 나눠 완료해도 한도를 넘지 않아요). 진행 중에 값을 바꾸면
            그 즉시 다시 계산돼요.
          </p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
            <span className="text-sm font-medium text-slate-700">켜기 (시작 시각부터 앱 홈에 카드로 보여요)</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={closeForm} className="rounded-lg border border-slate-300 px-5 py-2 text-sm text-slate-600 hover:bg-slate-100">
              취소
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving ? '저장 중…' : editingId ? '수정 저장' : '챌린지 등록'}
            </button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : loadError ? (
        <p className="mt-8 text-sm text-red-600">챌린지를 불러오지 못했어요: {loadError}</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">등록된 챌린지가 없어요. &lsquo;챌린지 추가&rsquo;로 만들어보세요.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((c) => {
            const st = statusOf(c);
            return (
              <div key={c.id} className={`rounded-xl border bg-white p-4 ${selectedId === c.id ? 'border-emerald-400' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => setSelectedId(c.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{c.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      목표 {c.goal_count}회 · 하루 최대 {c.daily_limit}회 인정 · 완료 처리 유예 {c.completion_grace_days}일 · 종료 후 {c.visible_days_after_end}일 노출
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {kstLabel(c.starts_at)} ~ {kstLabel(c.ends_at)} (한국 시간)
                    </p>
                  </button>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => toggleActive(c)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${c.active ? 'border border-slate-300 text-slate-600 hover:bg-slate-100' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>
                      {c.active ? '끄기' : '켜기'}
                    </button>
                    <button onClick={() => openEdit(c)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                      수정
                    </button>
                    <button onClick={() => onDelete(c)} className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-red-600">
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected ? <ParticipantsPanel key={selected.id} challenge={selected} /> : null}
    </div>
  );
}

type CompletedMeetup = {
  completion_id: string;
  title: string;
  host: string;
  meetup_status: string;
  status: MeetupCompletion['status'];
  completed_at: string;
  present: number;
};
const MEETUP_LIST_LIMIT = 300;

function ParticipantsPanel({ challenge }: { challenge: Challenge }) {
  const [rows, setRows] = useState<ChallengeParticipantRow[]>([]);
  const [meetups, setMeetups] = useState<CompletedMeetup[]>([]);
  const [meetupTotal, setMeetupTotal] = useState(0);
  const [meetupError, setMeetupError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'credited' | 'achieved'>('credited');
  const [achievedOnly, setAchievedOnly] = useState(false);
  const [detailUser, setDetailUser] = useState<ChallengeParticipantRow | null>(null);
  const [editCompletionId, setEditCompletionId] = useState<string | null>(null);
  const [version, setVersion] = useState(0); // 정정이 있을 때마다 올려 상세 창도 다시 읽게 한다

  const load = useCallback(async () => {
    setLoading(true);
    // 참여 신청자가 1000명을 넘어도 끝까지 읽는다(전체 인원·CSV 가 잘리지 않게)
    const all = await readAll<ChallengeParticipantRow>((from, to) => supabase.rpc('challenge_participants', { p_challenge_id: challenge.id }).range(from, to));
    setError(all.error);
    setRows(all.rows);

    // 완료 처리된 번개(정정하러 들어갈 목록): 유예 기간에 처리된 것까지, 최근 것부터 일부만
    const until = new Date(new Date(challenge.ends_at).getTime() + challenge.completion_grace_days * 86400000).toISOString();
    const { data: done, error: doneErr, count } = await supabase
      .from('meetup_completions')
      .select('*', { count: 'exact' })
      .gte('completed_at', challenge.starts_at)
      .lte('completed_at', until)
      .order('completed_at', { ascending: false })
      .limit(MEETUP_LIST_LIMIT);
    const completions = (done as MeetupCompletion[] | null) ?? [];
    setMeetupTotal(count ?? completions.length);
    let listError = doneErr ? doneErr.message : '';
    // 제목·참석 인원은 완료 기록에 적힌 값(번개가 지워져도 남는다). 번개의 지금 상태와 호스트 이름만 따로 읽는다.
    const statusById = new Map<string, string>();
    const hostName = new Map<string, string>();
    const meetupIds = completions.map((c) => c.meetup_id).filter((v): v is string => !!v);
    const hostIds = [...new Set(completions.map((c) => c.host_id).filter((v): v is string => !!v))];
    for (const ids of chunks(meetupIds, 100)) {
      const { data: ms, error: e } = await supabase.from('meetups').select('id, status').in('id', ids);
      if (e) listError = e.message;
      ((ms as { id: string; status: string }[] | null) ?? []).forEach((m) => statusById.set(m.id, m.status));
    }
    for (const ids of chunks(hostIds, 100)) {
      const { data: hosts, error: e } = await supabase.from('profiles').select('id, nickname').in('id', ids);
      if (e) listError = e.message;
      ((hosts as { id: string; nickname: string }[] | null) ?? []).forEach((h) => hostName.set(h.id, h.nickname));
    }
    setMeetupError(listError);
    setMeetups(
      completions.map((c) => ({
        completion_id: c.id,
        title: c.meetup_id ? c.meetup_title : `${c.meetup_title} (삭제된 번개)`,
        host: c.host_id ? (hostName.get(c.host_id) ?? '-') : '(탈퇴)',
        meetup_status: c.meetup_id ? (statusById.get(c.meetup_id) ?? '') : '',
        status: c.status,
        completed_at: c.completed_at,
        present: c.present_count,
      })),
    );
    setLoading(false);
  }, [challenge.id, challenge.starts_at, challenge.ends_at, challenge.completion_grace_days]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function onCorrected() {
    setVersion((v) => v + 1);
    load();
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!achievedOnly || r.achieved) &&
        (!q || r.nickname.toLowerCase().includes(q) || (r.email ?? '').toLowerCase().includes(q) || r.instagram_id.includes(q.replace(/^@/, ''))),
    );
    const byCredited = (a: ChallengeParticipantRow, b: ChallengeParticipantRow) =>
      b.credited_count - a.credited_count || (a.achieved_at ?? '9').localeCompare(b.achieved_at ?? '9') || a.nickname.localeCompare(b.nickname);
    if (sort === 'credited') return [...list].sort(byCredited);
    // 달성일순: 먼저 달성한 사람부터, 달성 전인 사람은 인정 횟수순으로 뒤에
    return [...list].sort((a, b) => {
      if (a.achieved_at && b.achieved_at) return a.achieved_at.localeCompare(b.achieved_at) || a.nickname.localeCompare(b.nickname);
      if (a.achieved_at) return -1;
      if (b.achieved_at) return 1;
      return byCredited(a, b);
    });
  }, [rows, query, sort, achievedOnly]);

  const achievedCount = rows.filter((r) => r.achieved).length;

  function exportCsv() {
    downloadCsv(
      `${challenge.title}_${achievedOnly ? '달성자' : '참여현황'}_${kstLabel(new Date().toISOString(), false)}.csv`,
      ['닉네임', '인스타그램 아이디', '인스타그램 주소', '이메일', '실제 참여 횟수', '인정 횟수', '목표', '달성 여부', '달성일(한국 시간)', '참여 신청(한국 시간)', '사용자 ID'],
      shown.map((r) => [
        r.nickname,
        r.instagram_id,
        `https://www.instagram.com/${r.instagram_id}/`,
        r.email,
        r.actual_count,
        r.credited_count,
        r.goal_count,
        r.achieved ? '달성' : '',
        r.achieved_at ? kstLabel(r.achieved_at) : '',
        kstLabel(r.enrolled_at),
        r.user_id,
      ]),
    );
  }

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">참여 현황 — {challenge.title}</h2>
          <p className="mt-1 text-sm text-slate-500">
            참여 신청 {rows.length}명 · 달성 {achievedCount}명 (목표 {challenge.goal_count}회)
          </p>
        </div>
        <button onClick={load} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
          새로고침
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input className={`${inputCls} max-w-xs`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="닉네임·인스타그램·이메일 검색" />
        <select className={`${inputCls} w-auto`} value={sort} onChange={(e) => setSort(e.target.value as 'credited' | 'achieved')}>
          <option value="credited">인정 횟수 많은 순</option>
          <option value="achieved">달성일 빠른 순</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={achievedOnly} onChange={(e) => setAchievedOnly(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" />
          달성자만 (추첨 대상)
        </label>
        <button onClick={exportCsv} disabled={shown.length === 0} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40">
          CSV 내려받기 ({shown.length}명)
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">참여 현황을 불러오지 못했어요: {error}</p> : null}
      {loading ? (
        <p className="mt-6 text-slate-500">불러오는 중…</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">{rows.length === 0 ? '아직 참여 신청한 사람이 없어요.' : '조건에 맞는 참여자가 없어요.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">닉네임</th>
                <th className="px-4 py-2 font-medium">인스타그램</th>
                <th className="px-4 py-2 font-medium">이메일</th>
                <th className="px-4 py-2 font-medium">참여 신청</th>
                <th className="px-4 py-2 text-right font-medium">실제 참여</th>
                <th className="px-4 py-2 text-right font-medium">인정</th>
                <th className="px-4 py-2 font-medium">달성</th>
                <th className="px-4 py-2 font-medium">달성일</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.user_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.nickname}</td>
                  <td className="px-4 py-2 text-slate-600">
                    <a href={`https://www.instagram.com/${r.instagram_id}/`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      @{r.instagram_id}
                    </a>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.email ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{kstLabel(r.enrolled_at)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.actual_count}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-800">
                    {r.progress} / {r.goal_count}
                    {r.credited_count > r.goal_count ? <span className="ml-1 text-xs font-normal text-slate-400">(인정 {r.credited_count})</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {r.achieved ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">달성</span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.achieved_at ? kstLabel(r.achieved_at) : '-'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setDetailUser(r)} className="text-sm font-medium text-emerald-700 hover:underline">
                      내역 보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-10 text-base font-semibold text-slate-800">기간 안에 완료 처리된 번개 {meetupTotal}건</h3>
      <p className="mt-1 text-sm text-slate-500">
        잘못된 완료·출석은 여기서 정정합니다. 정정하면 참여 현황에 바로 반영돼요.
        {meetupTotal > meetups.length ? ` 최근 ${meetups.length}건만 보여요 — 더 오래된 것은 참여자의 '내역 보기'에서 정정할 수 있어요.` : ''}
      </p>
      {meetupError ? <p className="mt-2 text-sm text-red-600">번개 목록을 다 불러오지 못했어요: {meetupError}</p> : null}
      {meetups.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">완료 처리된 번개가 없어요.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">완료 처리 (한국 시간)</th>
                <th className="px-4 py-2 font-medium">번개</th>
                <th className="px-4 py-2 font-medium">호스트</th>
                <th className="px-4 py-2 text-right font-medium">참석</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {meetups.map((m) => (
                <tr key={m.completion_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 text-slate-600">{kstLabel(m.completed_at)}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">{m.title}</td>
                  <td className="px-4 py-2 text-slate-600">{m.host}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{m.present}명</td>
                  <td className="px-4 py-2">
                    {m.status === 'voided' ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">무효</span>
                    ) : m.meetup_status === 'cancelled' ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">번개 취소</span>
                    ) : m.present < 2 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">참석 2명 미만</span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">정상</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditCompletionId(m.completion_id)} className="text-sm font-medium text-emerald-700 hover:underline">
                      정정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailUser ? (
        <EntriesModal
          challenge={challenge}
          user={detailUser}
          version={version}
          onClose={() => setDetailUser(null)}
          onEdit={setEditCompletionId}
          onChanged={onCorrected}
        />
      ) : null}
      {editCompletionId ? <CompletionEditor completionId={editCompletionId} onClose={() => setEditCompletionId(null)} onChanged={onCorrected} /> : null}
    </section>
  );
}

// 한 사람의 인정 내역
function EntriesModal({
  challenge,
  user,
  version,
  onClose,
  onEdit,
  onChanged,
}: {
  challenge: Challenge;
  user: ChallengeParticipantRow;
  version: number;
  onClose: () => void;
  onEdit: (completionId: string) => void;
  onChanged: () => void;
}) {
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // 참여 신청 정정(신청 시각·인스타그램 아이디) — 저장한 값을 이 창에 바로 보여주려고 따로 들고 있는다
  const [enrolledAt, setEnrolledAt] = useState(user.enrolled_at);
  const [instagramId, setInstagramId] = useState(user.instagram_id);
  const [timeInput, setTimeInput] = useState(toKstInput(user.enrolled_at));
  const [igInput, setIgInput] = useState(user.instagram_id);
  const [savingEnroll, setSavingEnroll] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  async function saveEnrollment() {
    const iso = fromKstInput(timeInput);
    if (!iso) {
      setEnrollError('참여 신청 시각을 입력해주세요.');
      return;
    }
    if (!confirm(`참여 신청을 ${kstLabel(iso)}(한국 시간) · @${igInput.trim().replace(/^@/, '')} 으로 바꿀까요?\n신청 시각 이후에 완료 처리된 참석만 인정돼요.`)) return;
    setEnrollError('');
    setSavingEnroll(true);
    const { data, error: err } = await supabase.rpc('challenge_enrollment_admin_set', {
      p_challenge_id: challenge.id,
      p_user_id: user.user_id,
      p_enrolled_at: iso,
      p_instagram_id: igInput,
      p_note: '관리자 웹 정정',
    });
    setSavingEnroll(false);
    if (err || data !== 'ok') {
      setEnrollError(err ? err.message : (ENROLL_ERRORS[String(data)] ?? '정정하지 못했어요.'));
      return;
    }
    // 서버가 다듬어 저장한 값을 그대로 보여준다(주소로 넣은 아이디 등)
    const { data: saved } = await supabase
      .from('challenge_enrollments')
      .select('enrolled_at, instagram_id')
      .eq('challenge_id', challenge.id)
      .eq('user_id', user.user_id)
      .maybeSingle();
    const row = saved as { enrolled_at: string; instagram_id: string } | null;
    setEnrolledAt(row?.enrolled_at ?? iso);
    setInstagramId(row?.instagram_id ?? igInput);
    setTimeInput(toKstInput(row?.enrolled_at ?? iso));
    setIgInput(row?.instagram_id ?? igInput);
    onChanged();
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase.rpc('challenge_entries', { p_challenge_id: challenge.id, p_user_id: user.user_id });
    setError(err ? err.message : '');
    setEntries((data as ChallengeEntry[] | null) ?? []);
    setLoading(false);
  }, [challenge.id, user.user_id]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load, version]);

  const credited = entries.filter((e) => e.credited).length;

  return (
    <Modal open onClose={onClose} title={`${user.nickname} — 인정 내역`} wide dismissable>
      <p className="text-sm text-slate-600">
        @{instagramId} · {user.email ?? '이메일 없음'} · 실제 참여 {entries.filter((e) => e.counted).length}회 · 인정 {credited}회 (목표 {challenge.goal_count}회)
      </p>
      <div className="mt-3 rounded-xl border border-slate-200 p-3">
        <p className="text-sm font-medium text-slate-700">참여 신청 정정 — 지금 값: {kstLabel(enrolledAt)} (한국 시간)</p>
        <p className="mt-1 text-xs text-slate-400">신청 시각 이후에 완료 처리된 참석만 인정돼요. 신청이 늦었다는 문의를 바로잡을 때 시각을 앞당겨요.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="datetime-local" step={1} className={`${inputCls} max-w-xs`} value={timeInput} onChange={(e) => setTimeInput(e.target.value)} />
          <input className={`${inputCls} max-w-[14rem]`} value={igInput} onChange={(e) => setIgInput(e.target.value)} placeholder="인스타그램 아이디" maxLength={80} />
          <button
            onClick={saveEnrollment}
            disabled={savingEnroll || (timeInput === toKstInput(enrolledAt) && igInput === instagramId)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            {savingEnroll ? '저장 중…' : '정정 저장'}
          </button>
        </div>
        {enrollError ? <p className="mt-2 text-sm text-red-600">{enrollError}</p> : null}
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">불러오지 못했어요: {error}</p> : null}
      {loading ? (
        <p className="mt-4 text-slate-500">불러오는 중…</p>
      ) : entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">기간 안의 기록이 없어요.</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">인정 날짜</th>
                <th className="px-3 py-2 font-medium">번개</th>
                <th className="px-3 py-2 font-medium">완료 처리</th>
                <th className="px-3 py-2 font-medium">출석</th>
                <th className="px-3 py-2 font-medium">결과</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.completion_id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-600">{e.credit_date}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-800">
                      {e.meetup_title}
                      {e.meetup_id ? '' : ' (삭제된 번개)'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {e.location_name} · 시작 {kstLabel(e.meetup_start_time)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{kstLabel(e.completed_at)}</td>
                  <td className="px-3 py-2 text-slate-600">{ATTENDANCE_LABEL[e.attendance]}</td>
                  <td className="px-3 py-2">
                    {e.credited ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{e.credit_no}회차 인정</span>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{e.reason ? REASON_LABEL[e.reason] : '인정 안 됨'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onEdit(e.completion_id)} className="text-sm font-medium text-emerald-700 hover:underline">
                      정정
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

type EditorPerson = { user_id: string; nickname: string; status: AttendanceStatus | null; isHost: boolean };

// 완료 기록 한 건의 정정: 출석, 완료 무효/무효 취소, 완료 처리 시각
function CompletionEditor({ completionId, onClose, onChanged }: { completionId: string; onClose: () => void; onChanged: () => void }) {
  const [completion, setCompletion] = useState<MeetupCompletion | null>(null);
  const [meetupStatus, setMeetupStatus] = useState<string | null>(null); // 번개의 지금 상태(지워졌으면 null)
  const [voidReason, setVoidReason] = useState('');
  const [people, setPeople] = useState<EditorPerson[]>([]);
  const [timeInput, setTimeInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase.from('meetup_completions').select('*').eq('id', completionId).maybeSingle();
    const row = (c as MeetupCompletion | null) ?? null;
    setCompletion(row);
    if (!row) {
      setLoading(false);
      return;
    }
    const [{ data: att }, { data: parts }, { data: m }, { data: logs }] = await Promise.all([
      supabase.from('meetup_attendance').select('user_id, status').eq('completion_id', completionId),
      row.meetup_id
        ? supabase.from('meetup_participants').select('user_id').eq('meetup_id', row.meetup_id).eq('status', 'approved')
        : Promise.resolve({ data: [] }),
      row.meetup_id ? supabase.from('meetups').select('status').eq('id', row.meetup_id).maybeSingle() : Promise.resolve({ data: null }),
      // 무효 사유는 완료 기록이 아니라 감사로그에 남는다
      row.status === 'voided'
        ? supabase
            .from('audit_logs')
            .select('new_data')
            .eq('entity_type', 'meetup_completions')
            .eq('entity_id', completionId)
            .eq('action', 'meetup.completion_set')
            .order('created_at', { ascending: false })
            .limit(1)
        : Promise.resolve({ data: [] }),
    ]);
    const attRows = (att as { user_id: string; status: AttendanceStatus }[] | null) ?? [];
    const statusBy = new Map(attRows.map((a) => [a.user_id, a.status]));
    // 출석 명단 + (완료 처리 뒤 승인돼 명단에 없는) 승인 참가자 + 호스트
    const ids = [
      ...new Set([...attRows.map((a) => a.user_id), ...((parts as { user_id: string }[] | null) ?? []).map((p) => p.user_id), ...(row.host_id ? [row.host_id] : [])]),
    ];
    const { data: profs } = ids.length ? await supabase.from('profiles').select('id, nickname').in('id', ids) : { data: [] };
    const nameBy = new Map(((profs as { id: string; nickname: string }[] | null) ?? []).map((p) => [p.id, p.nickname]));
    const lastLog = ((logs as { new_data: { reason?: string } | null }[] | null) ?? [])[0];
    setMeetupStatus((m as { status: string } | null)?.status ?? null);
    setVoidReason(lastLog?.new_data?.reason ?? '');
    setTimeInput(toKstInput(row.completed_at));
    setPeople(
      ids
        .map((id) => ({ user_id: id, nickname: nameBy.get(id) ?? '(알 수 없음)', status: statusBy.get(id) ?? null, isHost: id === row.host_id }))
        .sort((x, y) => Number(y.isHost) - Number(x.isHost) || x.nickname.localeCompare(y.nickname)),
    );
    setLoading(false);
  }, [completionId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // 서버 함수 결과 처리 공통
  async function run(key: string, call: () => PromiseLike<{ data: string | null; error: { message: string } | null }>) {
    setError('');
    setBusy(key);
    const { data, error: err } = await call();
    setBusy(null);
    if (err || data !== 'ok') {
      setError(err ? err.message : (ADMIN_ERRORS[String(data)] ?? '처리하지 못했어요.'));
      return;
    }
    await load();
    onChanged();
  }

  function setAttendance(userId: string, status: AttendanceStatus) {
    return run(userId, () =>
      supabase.rpc('meetup_attendance_admin_set', { p_completion_id: completionId, p_user_id: userId, p_status: status, p_note: '관리자 웹 정정' }),
    );
  }

  function setCompletionStatus(status: 'voided' | 'completed') {
    let reason = '';
    if (status === 'voided') {
      const input = prompt('완료를 무효로 처리하는 이유를 적어주세요. (이 번개의 참석이 모두 실적에서 빠져요)');
      if (input === null) return;
      reason = input.trim();
    } else if (!confirm('무효 처리를 취소할까요? 원래 완료 처리한 날짜로 다시 인정돼요.')) {
      return;
    }
    return run('completion', () => supabase.rpc('meetup_completion_admin_set', { p_completion_id: completionId, p_status: status, p_reason: reason }));
  }

  function saveTime() {
    const iso = fromKstInput(timeInput);
    if (!iso) {
      setError('완료 처리 시각을 입력해주세요.');
      return;
    }
    if (!confirm(`완료 처리 시각을 ${kstLabel(iso)}(한국 시간)으로 바꿀까요?\n인정 날짜가 이 시각의 날짜로 바뀌어요.`)) return;
    return run('time', () => supabase.rpc('meetup_completion_admin_set_time', { p_completion_id: completionId, p_completed_at: iso, p_note: '관리자 웹 정정' }));
  }

  return (
    <Modal open onClose={onClose} title="완료·출석 정정" dismissable>
      {loading && !completion ? (
        <p className="text-slate-500">불러오는 중…</p>
      ) : !completion ? (
        <p className="text-sm text-slate-500">완료 기록을 찾을 수 없어요.</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-slate-800">
                {completion.meetup_title}
                {completion.meetup_id ? '' : ' (삭제된 번개)'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {completion.location_name} · 시작 {kstLabel(completion.meetup_start_time)}
                {meetupStatus === 'cancelled' ? ' · 취소된 번개' : ''}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                완료 처리 {kstLabel(completion.completed_at)} · 참석 {completion.present_count}명
              </p>
              {completion.status === 'voided' ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  무효 처리됨{voidReason ? ` — ${voidReason}` : ''}
                </p>
              ) : null}
            </div>
            <button
              onClick={() => setCompletionStatus(completion.status === 'voided' ? 'completed' : 'voided')}
              disabled={busy !== null}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${completion.status === 'voided' ? 'border border-slate-300 text-slate-600 hover:bg-slate-100' : 'bg-red-600 text-white hover:bg-red-700'}`}>
              {completion.status === 'voided' ? '무효 취소' : '완료 무효 처리'}
            </button>
          </div>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

          <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
            {people.map((p) => (
              <div key={p.user_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800">{p.nickname}</span>
                  {p.isHost ? <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">호스트</span> : null}
                  {p.status === null ? <span className="ml-2 text-xs text-slate-400">명단에 없음</span> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {(['present', 'absent', 'unknown'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setAttendance(p.user_id, st)}
                      disabled={busy !== null || p.status === st}
                      className={`rounded-lg px-3 py-1 text-sm ${p.status === st ? 'bg-slate-800 font-medium text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50'}`}>
                      {ATTENDANCE_LABEL[st]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-700">완료 처리 시각 정정 (한국 시간)</p>
            <p className="mt-1 text-xs text-slate-400">
              인정 날짜는 이 시각의 날짜예요. 호스트가 늦게 처리했거나 여러 날 치를 한꺼번에 처리했을 때 바로잡는 용도예요. 번개 시작 이후 ~ 지금 사이로만 바꿀 수
              있어요.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input type="datetime-local" step={1} className={`${inputCls} max-w-xs`} value={timeInput} onChange={(e) => setTimeInput(e.target.value)} />
              <button
                onClick={saveTime}
                disabled={busy !== null || timeInput === toKstInput(completion.completed_at)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-40">
                시각 바꾸기
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">참석자가 2명보다 적어지면 이 번개는 아무에게도 인정되지 않아요. 정정 기록은 감사로그에 남아요.</p>
        </>
      )}
    </Modal>
  );
}

export default function ChallengesPage() {
  return (
    <Protected superAdmin>
      <ChallengesInner />
    </Protected>
  );
}
