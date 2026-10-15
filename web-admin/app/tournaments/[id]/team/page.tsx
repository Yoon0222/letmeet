'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { advanceCountForGroupSize, buildGroups, firstRoundPairs, groupCountForSize, roundName } from '@/lib/bracket';
import { advanceTeamKnockout, maybeFinishTeamTournament } from '@/lib/knockout';
import { supabase } from '@/lib/supabase';
import { teamStandings, tieWinner } from '@/lib/team-bracket';
import { useSession } from '@/lib/use-session';
import type { TieMatch, TournamentTeam, TournamentTie } from '@/lib/types';

import { useTournament } from '../_ctx';
import { CourtManager } from '../courts/CourtManager';

export default function TeamBracketTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, courts, loading, reload } = useTournament();

  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [ties, setTies] = useState<TournamentTie[]>([]);
  const [subs, setSubs] = useState<TieMatch[]>([]);
  const [perGroup, setPerGroup] = useState(4);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState<Record<string, { s1: string; s2: string }>>({}); // 서브매치 점수 입력
  // 보기 선택 — 예선(조별)과 본선(토너먼트)을 먼저 나누고, 예선은 조를, 본선은 라운드를 골라 본다(조·라운드가 많아서).
  //   '' = 아직 안 고름 → 진행할 곳을 알아서 보여 준다
  const [stage, setStage] = useState<'' | 'group' | 'ko'>('');
  const [view, setView] = useState(''); // 예선: 'all' | 'g:<조 번호>'
  const [round, setRound] = useState(''); // 본선: 'all' | 'r:<라운드 순서>'
  const [teamQ, setTeamQ] = useState(''); // 팀 이름으로 찾기

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
    // load 는 비동기로 await 이후 setState 를 호출한다 (동기 cascading 렌더 아님)
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      if (tie.phase === 'knockout') {
        await advanceTeamKnockout(id);
        await maybeFinishTeamTournament(id); // 결승 타이 확정 시 대회 자동 종료
      }
    }
    load();
  }

  // 타이에 코트 배정
  async function assignTieCourt(tieId: string, courtId: string | null) {
    await supabase.from('tournament_ties').update({ court_id: courtId }).eq('id', tieId);
    load();
  }

  // 타이 차례 알림 — 양 팀 주장에게 푸시 (notify-tie Edge Function). 주장이 팀원들을 데려온다.
  async function notifyTie(tieId: string) {
    const { data, error } = await supabase.functions.invoke('notify-tie', { body: { tie_id: tieId } });
    if (error) {
      alert(`알림 전송 실패: ${error.message}`);
      return;
    }
    const sent = (data as { sent?: number })?.sent ?? 0;
    alert(sent > 0 ? `양 팀 주장 ${sent}명에게 차례 알림을 보냈어요.` : '알림을 받을 주장이 없어요.');
  }

  // 본선(토너먼트) 생성 — 조별 상위 팀 진출 → knockout 타이 + 서브매치
  async function generateKnockout() {
    if (koTies.length > 0 || busy) return;
    const gc = t!.group_count ?? 0;
    // 조별 진출: 2팀 조는 둘 다, 3팀 이상은 꼴찌만 빼고(advanceCountForGroupSize)
    const byGroup: ReturnType<typeof teamStandings>[] = [];
    for (let g = 1; g <= gc; g++) {
      const gt = groupTies.filter((x) => (x.group_no ?? 1) === g);
      const teamIds = [...new Set(gt.flatMap((x) => [x.team1_id, x.team2_id]).filter(Boolean) as string[])];
      const st = teamStandings(teamIds, gt, subs);
      byGroup.push(st.slice(0, advanceCountForGroupSize(teamIds.length)));
    }
    // 시드: 각 조 1위 전부 → 각 조 2위 … 순(개인전 seedQualifiersBySize 와 같은 방식). 같은 순위끼리는 성적순
    //   (승 → 득실 → 득점, 같으면 조 번호순). 조 번호순으로만 넣으면 앞 조의 2위가 뒤 조의 1위보다 먼저 부전승을 받는다.
    //   같은 조 1·2위는 대진표에서 서로 먼 자리에 놓인다.
    const seeds: string[] = [];
    const maxAdv = Math.max(0, ...byGroup.map((x) => x.length));
    for (let rank = 0; rank < maxAdv; rank++) {
      byGroup
        .map((x) => x[rank])
        .filter((s): s is NonNullable<typeof s> => !!s)
        .sort((a, b) => b.wins - a.wins || b.diff - a.diff || b.pf - a.pf)
        .forEach((s) => seeds.push(s.teamId));
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
        {/* 코트 배정 + 차례 알림 (운영자, 진행 중 타이) */}
        {ready && isOrganizer && tie.status !== 'done' && courts.length > 0 ? (
          <div className="mt-2 flex items-center gap-2">
            <select
              value={tie.court_id ?? ''}
              onChange={(e) => assignTieCourt(tie.id, e.target.value || null)}
              className={`rounded border px-2 py-1 text-xs outline-none focus:border-emerald-500 ${tie.court_id ? 'border-slate-300' : 'border-amber-300 bg-amber-50'}`}
            >
              <option value="">코트 미배정</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.indoor ? '실내' : '실외'})</option>
              ))}
            </select>
            {tie.court_id ? (
              <button onClick={() => notifyTie(tie.id)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">차례 알림</button>
            ) : null}
          </div>
        ) : tie.court_id ? (
          <div className="mt-1 text-xs text-slate-500">🏟 {courts.find((c) => c.id === tie.court_id)?.name ?? '코트'}</div>
        ) : null}
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

  // ── 보기 선택 ──
  // 조 상태: 모든 대결이 끝났으면 완료, 끝난 게임이 있거나 코트가 배정됐으면 진행 중, 아니면 대기
  const tieSetState = (list: TournamentTie[]): 'done' | 'live' | 'todo' => {
    if (list.length > 0 && list.every((x) => x.status === 'done')) return 'done';
    const ids = new Set(list.map((x) => x.id));
    if (list.some((x) => x.court_id) || subs.some((m) => ids.has(m.tie_id) && m.status === 'done')) return 'live';
    return 'todo';
  };
  const isBye = (x: TournamentTie) => x.status === 'done' && (!x.team1_id || !x.team2_id);
  const groupState = (g: number) => tieSetState(groupTies.filter((x) => (x.group_no ?? 1) === g));
  const realTiesOf = (r: number) => koTies.filter((x) => (x.round_order ?? 1) === r && !isBye(x));
  const roundState = (r: number) => tieSetState(realTiesOf(r));
  const roundLabel = (r: number) => koTies.find((x) => (x.round_order ?? 1) === r)?.round_name ?? `${r}라운드`;
  const koAvailable = koTies.length > 0 || (groupsDone && isOrganizer);

  // 단계: 본선이 만들어졌으면 본선, 아니면 예선
  const curStage: 'group' | 'ko' = stage === 'ko' && koAvailable ? 'ko' : stage === 'group' ? 'group' : koTies.length > 0 ? 'ko' : 'group';

  // 예선: 진행할 첫 조
  const firstOpen = groupNos.find((g) => groupState(g) !== 'done');
  const validView = view === 'all' || (view.startsWith('g:') && groupNos.includes(Number(view.slice(2))));
  const current = validView ? view : firstOpen != null ? `g:${firstOpen}` : 'all';
  const shownGroups = curStage !== 'group' ? [] : current === 'all' ? groupNos : [Number(current.slice(2))];
  const curGroup = current.startsWith('g:') ? Number(current.slice(2)) : null;
  const curIdx = curGroup != null ? groupNos.indexOf(curGroup) : -1;

  // 본선: 실제 경기가 남은 첫 라운드(없으면 마지막 라운드)
  const firstOpenRound = koRounds.find((r) => realTiesOf(r).some((x) => x.status !== 'done'));
  const validRound = round === 'all' || (round.startsWith('r:') && koRounds.includes(Number(round.slice(2))));
  const curRoundKey = validRound ? round : firstOpenRound != null ? `r:${firstOpenRound}` : koRounds.length ? `r:${koRounds[koRounds.length - 1]}` : 'all';
  const shownRounds = curStage !== 'ko' ? [] : curRoundKey === 'all' ? koRounds : [Number(curRoundKey.slice(2))];
  const curRound = curRoundKey.startsWith('r:') ? Number(curRoundKey.slice(2)) : null;
  const curRoundIdx = curRound != null ? koRounds.indexOf(curRound) : -1;

  // 팀 이름 찾기 — 예선은 그 팀의 조로, 본선은 그 팀이 들어간 가장 늦은 라운드로
  const groupOfTeam = new Map<string, number>();
  groupTies.forEach((x) => {
    if (x.team1_id) groupOfTeam.set(x.team1_id, x.group_no ?? 1);
    if (x.team2_id) groupOfTeam.set(x.team2_id, x.group_no ?? 1);
  });
  const roundOfTeam = new Map<string, number>();
  koTies.forEach((x) => {
    const r = x.round_order ?? 1;
    for (const id of [x.team1_id, x.team2_id]) if (id && (roundOfTeam.get(id) ?? 0) < r) roundOfTeam.set(id, r);
  });
  const q = teamQ.trim().toLowerCase();
  const teamHits = q
    ? teams.filter((x) => (curStage === 'ko' ? roundOfTeam.has(x.id) : groupOfTeam.has(x.id)) && x.name.toLowerCase().includes(q)).slice(0, 8)
    : [];
  const doneCount = groupNos.filter((g) => groupState(g) === 'done').length;
  const chipCls = (on: boolean, state?: 'done' | 'live' | 'todo') =>
    `min-w-[2.5rem] rounded-lg border px-2 py-1 text-sm font-medium ${
      on
        ? 'border-slate-900 bg-slate-900 text-white'
        : state === 'done'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
          : state === 'live'
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
    }`;
  const stageCls = (on: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium ${on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'} disabled:cursor-not-allowed disabled:opacity-40`;
  const navBtn = 'rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40';

  return (
    <div className="space-y-4">
      {/* 대회 코트 — 단체전은 '코트배정' 탭이 없어 여기서 코트를 등록한다(코트가 있어야 대결마다 코트를 고를 수 있다) */}
      <CourtManager tournamentId={t.id} courts={courts} canEdit={isOrganizer} reload={reload} />
      {isOrganizer && courts.length === 0 ? (
        <p className="text-sm text-amber-700">대회 코트를 먼저 등록하면 각 대결에 코트를 배정하고 양 팀 주장에게 차례 알림을 보낼 수 있어요.</p>
      ) : null}

      {/* 보기 선택: 예선 / 본선 → 조 또는 라운드 */}
      <div className="sticky top-0 z-10 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          <button onClick={() => setStage('group')} className={stageCls(curStage === 'group')}>
            예선 (조별) <span className="opacity-60">{doneCount}/{groupNos.length}조 완료</span>
          </button>
          <button
            onClick={() => setStage('ko')}
            disabled={!koAvailable}
            title={koAvailable ? undefined : '예선이 끝나면 본선을 만들 수 있어요'}
            className={stageCls(curStage === 'ko')}>
            본선 (토너먼트){koTies.length === 0 && koAvailable ? <span className="opacity-60"> 생성 전</span> : null}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-700">{curStage === 'group' ? '조 선택' : '라운드 선택'}</p>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={teamQ}
                onChange={(e) => setTeamQ(e.target.value)}
                placeholder={curStage === 'group' ? '팀 이름으로 조 찾기' : '팀 이름으로 라운드 찾기'}
                className="w-48 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
              />
              {teamHits.length > 0 ? (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {teamHits.map((x) => (
                    <button
                      key={x.id}
                      onClick={() => {
                        if (curStage === 'group') setView(`g:${groupOfTeam.get(x.id)}`);
                        else setRound(`r:${roundOfTeam.get(x.id)}`);
                        setTeamQ('');
                      }}
                      className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                      <span>{x.name}</span>
                      <span className="text-xs text-slate-400">
                        {curStage === 'group' ? `${groupOfTeam.get(x.id)}조` : roundLabel(roundOfTeam.get(x.id) ?? 1)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : q ? (
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-400 shadow-lg">찾는 팀이 없어요.</div>
              ) : null}
            </div>
            {curStage === 'group' && curIdx >= 0 ? (
              <>
                <button onClick={() => setView(`g:${groupNos[curIdx - 1]}`)} disabled={curIdx <= 0} className={navBtn}>
                  ‹ 이전 조
                </button>
                <button onClick={() => setView(`g:${groupNos[curIdx + 1]}`)} disabled={curIdx >= groupNos.length - 1} className={navBtn}>
                  다음 조 ›
                </button>
              </>
            ) : null}
            {curStage === 'ko' && curRoundIdx >= 0 ? (
              <>
                <button onClick={() => setRound(`r:${koRounds[curRoundIdx - 1]}`)} disabled={curRoundIdx <= 0} className={navBtn}>
                  ‹ 이전 라운드
                </button>
                <button onClick={() => setRound(`r:${koRounds[curRoundIdx + 1]}`)} disabled={curRoundIdx >= koRounds.length - 1} className={navBtn}>
                  다음 라운드 ›
                </button>
              </>
            ) : null}
          </div>
        </div>

        {curStage === 'group' ? (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setView('all')} className={chipCls(current === 'all')}>
              전체
            </button>
            {groupNos.map((g) => (
              <button key={g} onClick={() => setView(`g:${g}`)} className={chipCls(current === `g:${g}`, groupState(g))} title={`${g}조`}>
                {g}
              </button>
            ))}
          </div>
        ) : koTies.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setRound('all')} className={chipCls(curRoundKey === 'all')}>
              전체
            </button>
            {koRounds.map((r) => (
              <button key={r} onClick={() => setRound(`r:${r}`)} className={chipCls(curRoundKey === `r:${r}`, roundState(r))}>
                {roundLabel(r)} <span className="opacity-60">{realTiesOf(r).length}</span>
              </button>
            ))}
          </div>
        ) : null}
        <p className="text-xs text-slate-400">
          <span className="text-emerald-700">초록</span> 완료 · <span className="text-amber-700">노랑</span> 진행 중(코트 배정·점수 입력) · 흰색 대기
          {curStage === 'ko' && koTies.length > 0 ? ' · 라운드 옆 숫자는 실제 경기 수(부전승 제외)' : ''}
        </p>
      </div>

      {shownGroups.map((g) => {
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

      {/* 본선(토너먼트) — 고른 라운드의 실제 경기만, 부전승은 접어 둔다 */}
      {curStage !== 'ko' ? null : koTies.length > 0 ? (
        shownRounds.map((r) => {
          const all = koTies.filter((x) => (x.round_order ?? 1) === r);
          const real = all.filter((x) => !isBye(x));
          const byes = all.filter(isBye);
          return (
            <div key={r} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-medium">
                {roundLabel(r)} <span className="text-sm font-normal text-slate-400">· 경기 {real.length}개</span>
              </h3>
              {byes.length > 0 ? (
                <details className="mt-1 text-sm text-slate-500">
                  <summary className="cursor-pointer">부전승 {byes.length}팀</summary>
                  <p className="mt-1 leading-6">{byes.map((x) => nameOf(x.team1_id ?? x.team2_id)).join(', ')}</p>
                </details>
              ) : null}
              <div className="mt-3 space-y-3">
                {real.length > 0 ? real.map((tie) => renderTie(tie)) : <p className="text-sm text-slate-500">이 라운드는 모두 부전승이에요.</p>}
              </div>
            </div>
          );
        })
      ) : groupsDone && isOrganizer ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">예선이 끝났어요. 진출 팀으로 본선 토너먼트를 만들 수 있어요.</p>
          <button onClick={generateKnockout} disabled={busy} className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? '생성 중…' : '본선 토너먼트 생성'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
