'use client';

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
  const { t, matches, courts, loading, reload, name } = useTournament();

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
  const unassigned = remaining.filter((m) => !m.court_id);
  const courtName = (cid: string | null) => courts.find((c) => c.id === cid)?.name ?? null;

  async function assign(matchId: string, courtId: string | null) {
    await supabase.from('tournament_matches').update({ court_id: courtId }).eq('id', matchId);
    reload();
  }

  // 자동 배정: 미배정 잔여 경기를 "가장 적게 쓴 코트" 우선으로 균등 분배 (수동 배정은 유지)
  async function autoAssign() {
    if (courts.length === 0 || unassigned.length === 0) return;
    const load = new Map(courts.map((c) => [c.id, 0]));
    remaining.forEach((m) => {
      if (m.court_id && load.has(m.court_id)) load.set(m.court_id, (load.get(m.court_id) ?? 0) + 1);
    });
    const updates: { id: string; court_id: string }[] = [];
    for (const m of unassigned) {
      let best = courts[0];
      let min = Infinity;
      for (const c of courts) {
        const l = load.get(c.id) ?? 0;
        if (l < min) {
          min = l;
          best = c;
        }
      }
      load.set(best.id, (load.get(best.id) ?? 0) + 1);
      updates.push({ id: m.id, court_id: best.id });
    }
    for (const u of updates) {
      await supabase.from('tournament_matches').update({ court_id: u.court_id }).eq('id', u.id);
    }
    reload();
  }

  async function clearAll() {
    for (const m of remaining.filter((x) => x.court_id)) {
      await supabase.from('tournament_matches').update({ court_id: null }).eq('id', m.id);
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
          잔여 경기 <b className="text-slate-900">{remaining.length}</b>개 · 미배정{' '}
          <b className={unassigned.length ? 'text-amber-600' : 'text-emerald-600'}>{unassigned.length}</b>개 · 코트 {courts.length}면
        </div>
        {isOrganizer && (
          <div className="flex gap-2">
            <button
              onClick={autoAssign}
              disabled={unassigned.length === 0}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
            >
              미배정 {unassigned.length}개 자동 배정
            </button>
            <button onClick={clearAll} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              배정 초기화
            </button>
          </div>
        )}
      </div>

      {/* 코트 범례 */}
      <div className="mt-3 flex flex-wrap gap-2">
        {courts.map((c) => {
          const cnt = remaining.filter((m) => m.court_id === c.id).length;
          return (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-2 text-sm">
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                {c.indoor ? '실내' : '실외'}
              </span>
              <span className="text-xs text-slate-400">{cnt}경기</span>
            </span>
          );
        })}
      </div>

      {/* 잔여 경기 리스트 */}
      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">단계</th>
              <th className="px-4 py-2 font-medium">경기</th>
              <th className="px-4 py-2 font-medium">코트</th>
            </tr>
          </thead>
          <tbody>
            {remaining.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-4 py-2 text-slate-500">{matchLabel(m)}</td>
                <td className="px-4 py-2 font-medium text-slate-800">
                  {name(m.entry1_id)} <span className="text-slate-400">vs</span> {name(m.entry2_id)}
                </td>
                <td className="px-4 py-2">
                  {isOrganizer ? (
                    <select
                      value={m.court_id ?? ''}
                      onChange={(e) => assign(m.id, e.target.value || null)}
                      className={`rounded border px-2 py-1 text-sm outline-none focus:border-emerald-500 ${m.court_id ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}
                    >
                      <option value="">미배정</option>
                      {courts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.indoor ? '실내' : '실외'})
                        </option>
                      ))}
                    </select>
                  ) : m.court_id ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{courtName(m.court_id)}</span>
                  ) : (
                    <span className="text-xs text-slate-400">미배정</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
