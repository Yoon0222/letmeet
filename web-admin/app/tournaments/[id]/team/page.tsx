'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { advanceCountForGroupSize, buildGroups, firstRoundPairs, groupCountForSize, roundName } from '@/lib/bracket';
import { advanceTeamKnockout } from '@/lib/knockout';
import { supabase } from '@/lib/supabase';
import { teamStandings, tieWinner } from '@/lib/team-bracket';
import { useSession } from '@/lib/use-session';
import type { TieMatch, TournamentTeam, TournamentTie } from '@/lib/types';

import { useTournament } from '../_ctx';

export default function TeamBracketTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, loading } = useTournament();

  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [perGroup, setPerGroup] = useState(4);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<Record<string, { s1: string; s2: string }>>({}); // 서브매치 점수 입력

  const load = useCallback(async () => {
    const [{ data: tm }, { data: ti }] = await Promise.all([
      supabase.from('tournament_teams').select('*').eq('tournament_id', id),
      supabase.from('tournament_ties').select('*').eq('tournament_id', id).order('slot', { ascending: true }),
    ]);
    setTeams((tm as TournamentTeam[]) ?? []);
    const tieList = (ti as TournamentTie[]) ?? [];
    setTies(tieList);
    if (tieList.length > 0) {
      const { data: sm } = await supabase
        .from('tie_matches')
        .select('*')
        .in('tie_id', tieList.map((x) => x.id))
        .order('slot', { ascending: true });
      setSubs((sm as TieMatch[]) ?? []);
    } else {
      setSubs([]);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const approved = teams.filter((x) => x.status === 'approved');
  const nameOf = (teamId: string | null) => teams.find((x) => x.id === teamId)?.name ?? '미정';
  const groupTies = ties.filter((x) => x.phase === 'group');
  const groupNos = [...new Set(groupTies.map((x) => x.group_no ?? 1))].sort((a, b) => a - b);
  const koTies = ties
    .filter((x) => x.phase === 'knockout')
    .sort((a, b) => (a.round_order ?? 0) - (b.round_order ?? 0) || a.slot - b.slot);
  const koRounds = [...new Set(koTies.map((x) => x.round_order ?? 1))].sort((a, b) => a - b);
  const groupsDone = groupTies.length > 0 && groupTies.every((x) => x.status === 'done');

  // 팀 예선 생성 — 조별 팀 대진 + 각 타이 서브매치(단식 tie_singles + 복식 tie_doubles)
  async function generatePrelim() {
    if (ties.length > 0 || busy) return;
    const per = Math.max(2, perGroup);
    const ids = approved.map((x) => x.id);
    if (ids.length < 2) return;
    const gc = groupCountForSize(ids.length, per);
    const { rows } = buildGroups(ids, gc);
    if (rows.length === 0) {
      alert('대진을 만들 수 없어요. 승인 팀 수와 조당 팀 수를 확인하세요.');
      return;
    }
    setBusy(true);
    const { data: created, error } = await supabase
      .from('tournament_ties')
      .insert(
        rows.map((r) => ({
          tournament_id: id,
          phase: 'group' as const,
          group_no: r.group_no,
          slot: r.slot,
          team1_id: r.entry1_id,
          team2_id: r.entry2_id,
        })),
      )
      .select('id');
    if (error || !created) {
      setBusy(false);
      alert(`생성 실패: ${error?.message}`);
      return;
    }
    // 각 타이에 서브매치 생성
    const subRows: { tie_id: string; kind: 'singles' | 'doubles'; slot: number }[] = [];
    for (const tie of created) {
      let slot = 0;
      for (let i = 0; i < t!.tie_singles; i++) subRows.push({ tie_id: tie.id, kind: 'singles', slot: slot++ });
      for (let i = 0; i < t!.tie_doubles; i++) subRows.push({ tie_id: tie.id, kind: 'doubles', slot: slot++ });
    }
    if (subRows.length > 0) await supabase.from('tie_matches').insert(subRows);
    await supabase.from('tournaments').update({ group_count: gc, status: 'ongoing' }).eq('id', id);
    setBusy(false);
    load();
  }

  // 서브매치 점수 입력 → 승자 도출 → 타이 승자 재계산
  async function setSubScore(m: TieMatch) {
    const sc = score[m.id];
    const s1 = parseInt(sc?.s1 ?? (m.score1?.toString() ?? ''), 10);
    const s2 = parseInt(sc?.s2 ?? (m.score2?.toString() ?? ''), 10);
    if (isNaN(s1) || isNaN(s2)) {
      alert('양 팀 점수를 입력하세요.');
      return;
    }
    if (s1 === s2) {
      alert('무승부는 없어요. 점수를 다르게 입력하세요.');
      return;
    }
    const winner: 'team1' | 'team2' = s1 > s2 ? 'team1' : 'team2';
    await supabase.from('tie_matches').update({ score1: s1, score2: s2, winner, status: 'done' }).eq('id', m.id);
    const updated = subs
      .filter((x) => x.tie_id === m.tie_id)
      .map((x) => (x.id === m.id ? { ...x, winner, status: 'done' as const } : x));
    const tie = ties.find((x) => x.id === m.tie_id);
    const w = tieWinner(updated);
    if (tie) {
      const winnerTeamId = w ? (w === 'team1' ? tie.team1_id : tie.team2_id) : null;
      await supabase
        .from('tournament_ties')
        .update({ winner_team_id: winnerTeamId, status: w ? 'done' : 'scheduled' })
        .eq('id', tie.id);
      if (tie.phase === 'knockout') await advanceTeamKnockout(id);
    }
    load();
  }

  // 본선(토너먼트) 생성 — 조별 상위 팀 진출 → knockout 타이 + 서브매치
  async function generateKnockout() {
    if (koTies.length > 0 || busy) return;
    const gc = t!.group_count ?? 0;
    const seeds: string[] = [];
    for (let g = 1; g <= gc; g++) {
      const gt = groupTies.filter((x) => (x.group_no ?? 1) === g);
      const teamIds = [...new Set(gt.flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean) as string[])];
      const st = teamStandings(teamIds, gt, subs);
      seeds.push(...st.slice(0, advanceCountForGroupSize(teamIds.length)).map((s) => s.teamId));
    }
    if (seeds.length < 2) {
      alert('진출 팀이 2팀 이상이어야 본선을 만들 수 있어요.');
      return;
    }
    let size = 1;
    while (size < seeds.length) size *= 2;
    const totalRounds = Math.log2(size);
    const pairs = firstRoundPairs(seeds);
    setBusy(true);
    type TieRow = {
      tournament_id: string;
      phase: 'knockout';
      round_order: number;
      round_name: string;
      slot: number;
      team1_id?: string | null;
      team2_id?: string | null;
      winner_team_id?: string | null;
      status: 'scheduled' | 'done';
    };
    const rows: TieRow[] = pairs.map((p, i) => ({
      tournament_id: id,
      phase: 'knockout',
      round_order: 1,
      round_name: roundName(size),
      slot: i,
      team1_id: p[0],
      team2_id: p[1],
      winner_team_id: p[1] ? null : p[0],
      status: p[1] ? 'scheduled' : 'done',
    }));
    for (let r = 2; r <= totalRounds; r++) {
      const players = size / 2 ** (r - 1);
      for (let s = 0; s < players / 2; s++) {
        rows.push({ tournament_id: id, phase: 'knockout', round_order: r, round_name: roundName(players), slot: s, status: 'scheduled' });
      }
    }
    const { data: created, error } = await supabase.from('tournament_ties').insert(rows).select('id, status');
    if (error || !created) {
      setBusy(false);
      alert(`본선 생성 실패: ${error?.message}`);
      return;
    }
    // 부전승(status done)이 아닌 타이에 서브매치 미리 생성 (승리 팀 진출 시 바로 진행 가능)
    const subRows: { tie_id: string; kind: 'singles' | 'doubles'; slot: number }[] = [];
    for (const tie of created) {
      if (tie.status === 'done') continue;
      let slot = 0;
      for (let i = 0; i < t!.tie_singles; i++) subRows.push({ tie_id: tie.id, kind: 'singles', slot: slot++ });
      for (let i = 0; i < t!.tie_doubles; i++) subRows.push({ tie_id: tie.id, kind: 'doubles', slot: slot++ });
    }
    if (subRows.length > 0) await supabase.from('tie_matches').insert(subRows);
    await advanceTeamKnockout(id);
    setBusy(false);
    load();
  }

  // 타이 1건 렌더 (예선·본선 공용)
  function renderTie(tie: TournamentTie) {
    const tsubs = subs.filter((x) => x.tie_id === tie.id);
    const w1 = tsubs.filter((x) => x.winner === 'team1').length;
    const w2 = tsubs.filter((x) => x.winner === 'team2').length;
    const ready = !!tie.team1_id && !!tie.team2_id;
    return (
      <div key={tie.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between text-sm font-medium">
          <span className={tie.winner_team_id === tie.team1_id && tie.status === 'done' ? 'text-emerald-700' : ''}>{nameOf(tie.team1_id)}</span>
          <span className="text-slate-500">{w1} : {w2}{tie.status === 'done' ? ' · 종료' : ''}</span>
          <span className={tie.winner_team_id === tie.team2_id && tie.status === 'done' ? 'text-emerald-700' : ''}>{nameOf(tie.team2_id)}</span>
        </div>
        {ready ? (
          <div className="mt-2 space-y-1.5">
            {tsubs.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 text-sm">
                <span className="text-slate-600">
                  {m.kind === 'singles' ? '단식' : '복식'} {m.slot + 1}
                  {m.status === 'done' ? <span className="ml-1.5 text-xs text-slate-400">{m.winner === 'team1' ? nameOf(tie.team1_id) : nameOf(tie.team2_id)} 승</span> : null}
                </span>
                {isOrganizer ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      value={score[m.id]?.s1 ?? (m.score1?.toString() ?? '')}
                      onChange={(e) => setScore((p) => ({ ...p, [m.id]: { s1: e.target.value, s2: p[m.id]?.s2 ?? (m.score2?.toString() ?? '') } }))}
                      className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-center text-xs"
                    />
                    <span className="text-slate-400">:</span>
                    <input
                      type="number"
                      min={0}
                      value={score[m.id]?.s2 ?? (m.score2?.toString() ?? '')}
                      onChange={(e) => setScore((p) => ({ ...p, [m.id]: { s1: p[m.id]?.s1 ?? (m.score1?.toString() ?? ''), s2: e.target.value } }))}
                      className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-center text-xs"
                    />
                    <button onClick={() => setSubScore(m)} className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700">저장</button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">{m.status === 'done' ? `${m.score1} : ${m.score2}` : '예정'}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">양 팀 확정 대기 중</p>
        )}
      </div>
    );
  }

  // 대진 생성 전
  if (groupTies.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {approved.length < 2 ? (
          <p className="text-sm text-slate-500">참가 확정 팀이 2팀 이상이면 예선을 만들 수 있어요. (현재 {approved.length}팀)</p>
        ) : !isOrganizer ? (
          <p className="text-sm text-slate-500">아직 대진이 생성되지 않았습니다.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <p className="w-full text-sm text-slate-600">
              단체전 예선 — 조 안에서 팀끼리 겨루고, 각 대결은 단식 {t.tie_singles} + 복식 {t.tie_doubles} = 총 {t.tie_singles + t.tie_doubles}경기입니다.
            </p>
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">조당 팀 수 (승인 {approved.length}팀)</span>
              <input type="number" min={2} value={perGroup} onChange={(e) => setPerGroup(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button onClick={generatePrelim} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? '생성 중…' : `팀 예선 생성 (${groupCountForSize(approved.length, Math.max(2, perGroup))}개 조)`}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groupNos.map((g) => {
        const gTies = groupTies.filter((x) => (x.group_no ?? 1) === g);
        const teamIds = [...new Set(gTies.flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean) as string[])];
        const st = teamStandings(teamIds, gTies, subs);
        return (
          <div key={g} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-medium">{g}조</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="py-1 font-medium">순위</th><th className="py-1 font-medium">팀</th><th className="py-1 font-medium">승</th><th className="py-1 font-medium">득실</th><th className="py-1 font-medium">경기</th></tr>
              </thead>
              <tbody>
                {st.map((s, i) => (
                  <tr key={s.teamId} className="border-t border-slate-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1 font-medium">{nameOf(s.teamId)}</td>
                    <td className="py-1">{s.wins}</td>
                    <td className="py-1">{s.diff > 0 ? '+' : ''}{s.diff}</td>
                    <td className="py-1">{s.played}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-3 space-y-3">{gTies.map((tie) => renderTie(tie))}</div>
          </div>
        );
      })}

      {/* 본선(토너먼트) */}
      {koTies.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-medium">본선 토너먼트</h3>
          <div className="mt-3 space-y-4">
            {koRounds.map((r) => {
              const rTies = koTies.filter((x) => (x.round_order ?? 1) === r);
              return (
                <div key={r}>
                  <p className="mb-1.5 text-sm font-medium text-slate-500">{rTies[0]?.round_name ?? `${r}라운드`}</p>
                  <div className="space-y-3">{rTies.map((tie) => renderTie(tie))}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : groupsDone && isOrganizer ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">예선이 끝났어요. 상위 팀으로 본선 토너먼트를 만들 수 있어요.</p>
          <button onClick={generateKnockout} disabled={busy} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? '생성 중…' : '본선 토너먼트 생성'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
