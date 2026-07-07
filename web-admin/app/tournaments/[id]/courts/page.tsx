'use client';

import { useState } from 'react';

import { computeAutoAssign, computeQueueOrder } from '@/lib/court-assign';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { TournamentMatch } from '@/lib/types';

import { useTournament } from '../_ctx';

// 경기 라벨 (예선 3조 / 본선 4강 …)
function matchLabel(m: TournamentMatch): string {
  if (m.phase === 'group') return `예선 ${m.group_no}조`;
  return `본선 ${m.round_name ?? `R${m.round_order ?? ''}`}`;
}

export default function CourtsTab() {
  const { session } = useSession();
  const { t, matches, courts, loading, reload, name, query } = useTournament();
  const [phaseTab, setPhaseTab] = useState<'group' | 'knockout'>('group');

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  const isOrganizer = t.organizer_id === session?.user.id;

  // 잔여 경기 = 아직 끝나지 않은(부전승 제외) 경기, 예선→본선 순
  const remaining = matches
    .filter((m) => m.status !== 'done' && m.entry2_id)
    .sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'group' ? -1 : 1;
      if (a.phase === 'group') return (a.group_no ?? 0) - (b.group_no ?? 0) || a.slot - b.slot;
      return (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot;
    });

  // 코트 점유: 아직 안 끝난 경기가 배정된 코트는 "사용중" (코트당 동시에 1경기만)
  const busyByCourt = new Map<string, TournamentMatch>();
  // 선수 가용성: 코트에 배정된(=진행 중인) 경기의 팀은 "경기중" → 동시에 다른 코트 불가
  const playingTeams = new Set<string>();
  remaining.forEach((m) => {
    if (m.court_id) {
      busyByCourt.set(m.court_id, m);
      if (m.entry1_id) playingTeams.add(m.entry1_id);
      if (m.entry2_id) playingTeams.add(m.entry2_id);
    }
  });
  const freeCourts = courts.filter((c) => !busyByCourt.has(c.id));
  const teamsBusy = (m: TournamentMatch) =>
    (!!m.entry1_id && playingTeams.has(m.entry1_id)) || (!!m.entry2_id && playingTeams.has(m.entry2_id));
  const unassigned = remaining.filter((m) => !m.court_id);
  const readyToAssign = unassigned.filter((m) => !teamsBusy(m)); // 선수가 비어있어 지금 배정 가능
  const assigned = remaining.filter((m) => m.court_id);
  const unconfirmed = assigned.filter((m) => !m.court_confirmed); // 배정됐지만 아직 확정 전
  const courtName = (cid: string | null) => courts.find((c) => c.id === cid)?.name ?? null;

  // 배정 대기열(우선순위 순) → 경기별 대기번호
  const queueOrder = computeQueueOrder(matches);
  const queueNo = new Map<string, number>();
  queueOrder.forEach((m, i) => queueNo.set(m.id, i + 1));
  const courtIndex = new Map(courts.map((c, i) => [c.id, i]));

  // 예선/본선 서브탭
  const hasGroup = remaining.some((m) => m.phase === 'group');
  const hasKnockout = remaining.some((m) => m.phase === 'knockout');
  const phases: { key: 'group' | 'knockout'; label: string }[] = [
    ...(hasGroup ? [{ key: 'group' as const, label: '예선' }] : []),
    ...(hasKnockout ? [{ key: 'knockout' as const, label: '본선' }] : []),
  ];
  const activePhase = phases.some((p) => p.key === phaseTab) ? phaseTab : phases[0]?.key ?? 'group';

  // 현재 탭 경기: 배정됨 → 대기열(대기번호) → 대기(선수경기중/팀미정) 순 정렬
  const rowRank = (m: TournamentMatch) => (m.court_id ? 0 : queueNo.has(m.id) ? 1 : 2);
  const rowSub = (m: TournamentMatch) =>
    m.court_id ? courtIndex.get(m.court_id) ?? 99 : queueNo.get(m.id) ?? 999;
  const q = query.trim().toLowerCase();
  const matchHit = (m: TournamentMatch) =>
    !q || name(m.entry1_id).toLowerCase().includes(q) || name(m.entry2_id).toLowerCase().includes(q);
  const phaseRows = remaining
    .filter((m) => m.phase === activePhase)
    .filter(matchHit)
    .sort((a, b) => rowRank(a) - rowRank(b) || rowSub(a) - rowSub(b));
  // 대기번호는 탭(단계)별로 1부터
  const phaseQueueNo = new Map<string, number>();
  queueOrder.filter((m) => m.phase === activePhase).forEach((m, i) => phaseQueueNo.set(m.id, i + 1));

  // 수동 배정/변경 → 확정 상태는 초기화(다시 확정 필요)
  async function assign(matchId: string, courtId: string | null) {
    await supabase.from('tournament_matches').update({ court_id: courtId, court_confirmed: false }).eq('id', matchId);
    reload();
  }

  // 자동 배정(미확정 상태로): 선수 가용성/코트 점유를 지켜 준비된 경기를 빈 코트에.
  async function autoAssign() {
    const updates = computeAutoAssign(matches, courts); // 조별 진행수 계산을 위해 done 포함 전체 전달
    if (updates.length === 0) return;
    for (const u of updates) {
      await supabase.from('tournament_matches').update({ court_id: u.court_id, court_confirmed: false }).eq('id', u.id);
    }
    reload();
  }

  async function confirmMatch(matchId: string, confirmed: boolean) {
    await supabase.from('tournament_matches').update({ court_confirmed: confirmed }).eq('id', matchId);
    reload();
  }

  async function confirmAll() {
    for (const m of unconfirmed) {
      await supabase.from('tournament_matches').update({ court_confirmed: true }).eq('id', m.id);
    }
    reload();
  }

  async function clearAll() {
    for (const m of assigned) {
      await supabase.from('tournament_matches').update({ court_id: null, court_confirmed: false }).eq('id', m.id);
    }
    reload();
  }

  if (courts.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">등록된 코트가 없어요. 대회 생성 시 코트를 구성하면 여기서 경기별로 배정할 수 있어요.</div>;
  }
  if (remaining.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">배정할 잔여 경기가 없어요. (예선/본선 대진을 먼저 생성하세요)</div>;
  }

  return (
    <div>
      {/* 요약 + 자동 배정 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-sm text-slate-600">
          잔여 <b className="text-slate-900">{remaining.length}</b> · 미배정{' '}
          <b className={unassigned.length ? 'text-amber-600' : 'text-emerald-600'}>{unassigned.length}</b>
          <span className="text-slate-400"> (준비 {readyToAssign.length} · 선수경기중 {unassigned.length - readyToAssign.length})</span> · 확정대기{' '}
          <b className={unconfirmed.length ? 'text-amber-600' : 'text-slate-400'}>{unconfirmed.length}</b> · 코트 {courts.length}면 (여유{' '}
          <b className="text-emerald-600">{freeCourts.length}</b> · 사용중 {courts.length - freeCourts.length})
        </div>
        {isOrganizer && (
          <div className="flex gap-2">
            <button
              onClick={autoAssign}
              disabled={freeCourts.length === 0 || readyToAssign.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              준비된 경기 자동 배정
            </button>
            <button
              onClick={confirmAll}
              disabled={unconfirmed.length === 0}
              className="rounded-lg border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
            >
              전체 확정 ({unconfirmed.length})
            </button>
            <button onClick={clearAll} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              배정 초기화
            </button>
          </div>
        )}
      </div>

      {freeCourts.length > 0 && unassigned.length > 0 && readyToAssign.length === 0 && (
        <p className="mt-2 text-xs text-amber-600">빈 코트는 있지만 대기 경기의 선수들이 아직 경기 중이에요. 진행 경기가 끝나면 배정할 수 있어요.</p>
      )}
      {freeCourts.length === 0 && unassigned.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">모든 코트가 사용 중이에요. 진행 중인 경기가 끝나면(점수 입력) 코트가 비워져 다음 경기를 배정할 수 있어요.</p>
      )}

      {/* 코트 현황 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {courts.map((c) => {
          const busy = busyByCourt.get(c.id);
          return (
            <span key={c.id} className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-2 text-sm ${busy ? 'border-slate-300 bg-slate-100' : 'border-emerald-200 bg-emerald-50'}`}>
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {c.indoor ? '실내' : '실외'}
              </span>
              <span className={`text-xs font-medium ${busy ? 'text-slate-500' : 'text-emerald-600'}`}>{busy ? '사용중' : '여유'}</span>
            </span>
          );
        })}
      </div>

      {/* 예선/본선 서브탭 */}
      {phases.length > 1 && (
        <div className="mt-4 flex gap-1.5">
          {phases.map((p) => {
            const cnt = remaining.filter((m) => m.phase === p.key).length;
            return (
              <button
                key={p.key}
                onClick={() => setPhaseTab(p.key)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  activePhase === p.key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
                <span className={`ml-1.5 text-xs ${activePhase === p.key ? 'text-emerald-100' : 'text-slate-400'}`}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 잔여 경기 리스트 (배정 → 대기번호 → 대기 순) */}
      <div className={`${phases.length > 1 ? 'mt-3' : 'mt-4'} overflow-hidden rounded-xl border border-slate-200 bg-white`}>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">단계</th>
              <th className="px-4 py-2 font-medium">경기</th>
              <th className="px-4 py-2 font-medium">대기 / 코트</th>
            </tr>
          </thead>
          <tbody>
            {phaseRows.map((m) => {
              const courtSelect = (
                <select
                  value={m.court_id ?? ''}
                  onChange={(e) => assign(m.id, e.target.value || null)}
                  className={`rounded border px-2 py-1 text-sm outline-none focus:border-emerald-500 ${m.court_id ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}
                >
                  <option value="">미배정</option>
                  {courts.map((c) => {
                    const occupiedByOther = busyByCourt.has(c.id) && busyByCourt.get(c.id)!.id !== m.id;
                    return (
                      <option key={c.id} value={c.id} disabled={occupiedByOther}>
                        {c.name} ({c.indoor ? '실내' : '실외'}){occupiedByOther ? ' · 사용중' : ''}
                      </option>
                    );
                  })}
                </select>
              );
              return (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">{matchLabel(m)}</td>
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {name(m.entry1_id)} <span className="text-slate-400">vs</span> {name(m.entry2_id)}
                  </td>
                  <td className="px-4 py-2">
                    {isOrganizer ? (
                      m.court_id ? (
                        <div className="flex items-center gap-2">
                          {courtSelect}
                          {m.court_confirmed ? (
                            <button
                              onClick={() => confirmMatch(m.id, false)}
                              title="확정 취소"
                              className="whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
                            >
                              ✓ 확정됨
                            </button>
                          ) : (
                            <button
                              onClick={() => confirmMatch(m.id, true)}
                              className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                            >
                              확정
                            </button>
                          )}
                        </div>
                      ) : queueNo.has(m.id) ? (
                        <div className="flex items-center gap-2">
                          <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">대기 {phaseQueueNo.get(m.id)}</span>
                          {courtSelect}
                        </div>
                      ) : (
                        <span className="text-xs font-medium text-amber-600">선수 경기중 · 대기</span>
                      )
                    ) : m.court_id ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {courtName(m.court_id)} {m.court_confirmed ? '· 확정' : '· 예정'}
                      </span>
                    ) : queueNo.has(m.id) ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">대기 {phaseQueueNo.get(m.id)}</span>
                    ) : (
                      <span className="text-xs text-amber-600">선수 경기중</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
