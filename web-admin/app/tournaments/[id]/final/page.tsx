'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { MatchRow } from '@/components/match-row';
import {
  advanceCountForGroupSize,
  firstRoundPairs,
  roundName,
  seedQualifiersBySize,
  standings,
  type Standing,
} from '@/lib/bracket';
import { advanceKnockoutWinners } from '@/lib/knockout';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { TOURNAMENT_FORMAT_LABELS, type TournamentCourt, type TournamentMatch } from '@/lib/types';

import { useTournament } from '../_ctx';

function BracketMatchCard({
  match,
  name,
  avatarOf,
  courts,
  highlighted,
}: {
  match: TournamentMatch;
  name: (id: string | null) => string;
  avatarOf: (id: string | null) => { url: string | null; nickname: string } | null;
  courts: TournamentCourt[];
  highlighted: boolean;
}) {
  const done = match.status === 'done';
  const isBye = done && (!match.entry1_id || !match.entry2_id);
  const court = courts.find((item) => item.id === match.court_id);
  const player = (id: string | null, side: 1 | 2) => {
    const avatar = avatarOf(id);
    const winner = !!id && match.winner_id === id;
    const score = side === 1 ? match.score1 : match.score2;
    return (
      <div className={`flex min-h-8 items-center gap-2 px-2.5 ${winner ? 'font-semibold text-emerald-700' : id ? 'text-slate-800' : 'text-slate-400'}`}>
        {avatar ? <Avatar url={avatar.url} nickname={avatar.nickname} size={22} /> : <span className="h-[22px] w-[22px] rounded-full bg-slate-200" />}
        <span className="min-w-0 flex-1 truncate">{id ? name(id) : isBye ? '부전승' : '미정'}</span>
        {done && score != null ? <span className="tabular-nums">{score}</span> : null}
      </div>
    );
  };

  return (
    <div className={`relative w-64 rounded-lg border bg-white shadow-sm ${highlighted ? 'border-emerald-500 ring-1 ring-emerald-200' : 'border-slate-200'}`}>
      {player(match.entry1_id, 1)}
      <div className="mx-2 border-t border-slate-100" />
      {player(match.entry2_id, 2)}
      <div className="flex min-h-7 items-center justify-between border-t border-slate-100 px-2.5 text-[11px] text-slate-400">
        <span>{court ? `${court.indoor ? '실내' : '실외'} ${court.name}` : '코트 미정'}</span>
        <span className={isBye ? 'font-medium text-amber-600' : done ? 'font-medium text-emerald-600' : ''}>
          {isBye ? '부전승' : done ? '완료' : '예정'}
        </span>
      </div>
    </div>
  );
}

export default function FinalTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, matches, courts, loading, reload, name, avatarOf, query } = useTournament();
  const [viewMode, setViewMode] = useState<'bracket' | 'list'>('bracket');
  const [roundFilter, setRoundFilter] = useState<number | 'all'>('all');
  const [zoom, setZoom] = useState(0.9);

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  // KDK·단체전은 전용 진행 화면을 쓴다 (조별리그+토너먼트 엔진 미적용)
  if (t.format !== 'group_knockout') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        이 대회는 <b>{TOURNAMENT_FORMAT_LABELS[t.format]}</b> 방식이에요. 전용 진행 화면은 준비 중입니다.
      </div>
    );
  }

  const isOrganizer = t.organizer_id === session?.user.id;
  const unit = t.discipline === 'doubles' ? '팀' : '명';
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const koMatches = matches.filter((m) => m.phase === 'knockout');
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'done');

  // 조 크기별 자동 진출 수 (2팀=전원, 3팀↑=크기-1)
  const groupSizes = Array.from({ length: t.group_count ?? 0 }, (_, i) => i + 1).map(
    (g) =>
      new Set(
        groupMatches.filter((m) => m.group_no === g).flatMap((m) => [m.entry1_id, m.entry2_id]).filter(Boolean) as string[],
      ).size,
  );
  const totalAdvance = groupSizes.reduce((sum, s) => sum + advanceCountForGroupSize(s), 0);
  const bracketSize = (() => {
    let s = 1;
    while (s < Math.max(2, totalAdvance)) s *= 2;
    return s;
  })();

  // 점수 입력·차례 알림·코트 지정은 '코트 배정' 탭에서 처리한다 (여기는 대진·결과 열람 전용)

  async function generateKnockout() {
    if (koMatches.length > 0) return; // 이미 생성됨 → 중복 방지
    const gc = t?.group_count ?? 0;
    const byGroup: Standing[][] = [];
    for (let g = 1; g <= gc; g++) {
      const gm = groupMatches.filter((m) => m.group_no === g);
      const members = Array.from(new Set(gm.flatMap((m) => [m.entry1_id, m.entry2_id]).filter(Boolean) as string[]));
      byGroup.push(standings(members, gm));
    }
    // 조 크기 규칙에 따라 자동 진출 (2팀=전원, 3팀=상위2, 4팀=상위3 …)
    const seeds = seedQualifiersBySize(byGroup);
    if (seeds.length < 2) {
      alert('진출자가 2명 이상이어야 토너먼트를 만들 수 있어요.');
      return;
    }
    let size = 1;
    while (size < seeds.length) size *= 2;
    const totalRounds = Math.log2(size);
    const pairs = firstRoundPairs(seeds);
    type Row = {
      tournament_id: string;
      phase: 'knockout';
      round_order: number;
      round_name: string;
      slot: number;
      entry1_id: string | null;
      entry2_id: string | null;
      winner_id: string | null;
      status: 'scheduled' | 'done';
    };
    const rows: Row[] = [];
    // 1라운드: 시드 배치(부전승은 자동 확정)
    pairs.forEach((p, i) =>
      rows.push({
        tournament_id: id,
        phase: 'knockout',
        round_order: 1,
        round_name: roundName(size),
        slot: i,
        entry1_id: p[0],
        entry2_id: p[1],
        winner_id: p[1] ? null : p[0],
        status: p[1] ? 'scheduled' : 'done',
      }),
    );
    // 2라운드 ~ 결승: 빈 골격 미리 생성 (트리 전체 표시용)
    for (let r = 2; r <= totalRounds; r++) {
      const players = size / 2 ** (r - 1);
      for (let s = 0; s < players / 2; s++) {
        rows.push({
          tournament_id: id,
          phase: 'knockout',
          round_order: r,
          round_name: roundName(players),
          slot: s,
          entry1_id: null,
          entry2_id: null,
          winner_id: null,
          status: 'scheduled',
        });
      }
    }
    await supabase.from('tournament_matches').insert(rows);
    await advanceKnockoutWinners(id); // 부전승 승자를 다음 라운드로 전파
    reload();
  }

  // 본선이 아직 없음
  if (koMatches.length === 0) {
    if (groupMatches.length === 0) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          예선을 먼저 만들어 주세요.{' '}
          <Link href={`/tournaments/${id}/prelim`} className="font-medium text-emerald-700 hover:underline">
            예선 탭으로 →
          </Link>
        </div>
      );
    }
    if (!groupsDone) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
          예선 경기를 모두 마치면 본선 토너먼트를 만들 수 있어요.
        </div>
      );
    }
    if (!isOrganizer) {
      return <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">아직 본선이 생성되지 않았습니다.</div>;
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="text-sm text-slate-600">
          조 크기별 자동 진출 — <b>2{unit} 조: 전원</b> · <b>3{unit} 조: 상위 2</b> · <b>4{unit} 조: 상위 3</b> (그 외 크기−1)
        </div>
        <div className="mt-1.5 text-sm text-slate-500">
          현재 {groupSizes.length}개 조 → 총 <b className="text-emerald-700">{totalAdvance}{unit}</b> 진출 → {roundName(bracketSize)}
          {bracketSize > totalAdvance ? ` (${bracketSize - totalAdvance}자리 상위 시드 부전승)` : ''}
        </div>
        <button onClick={generateKnockout} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          본선 토너먼트 생성 ({totalAdvance}{unit})
        </button>
      </div>
    );
  }

  // 본선 진행 — 우승자 판정
  const maxRound = Math.max(...koMatches.map((m) => m.round_order ?? 0));
  const curKo = koMatches.filter((m) => m.round_order === maxRound);
  const curKoDone = curKo.length > 0 && curKo.every((m) => m.status === 'done');
  const champion = maxRound > 0 && curKo.length === 1 && curKoDone ? curKo[0].winner_id : null;
  const koRounds = Array.from(new Set(koMatches.map((m) => m.round_order)))
    .filter((round): round is number => round !== null)
    .sort((a, b) => a - b);
  const q = query.trim().toLowerCase();
  const matchHit = (m: TournamentMatch) =>
    !q || name(m.entry1_id).toLowerCase().includes(q) || name(m.entry2_id).toLowerCase().includes(q);
  const visibleRounds = roundFilter === 'all' ? koRounds : koRounds.filter((round) => round === roundFilter);

  return (
    <div className="space-y-4">
      {champion && (
        <div className="rounded-xl bg-amber-50 p-4 text-center ring-1 ring-amber-200">
          <div className="text-sm text-amber-700">🏆 우승</div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{name(champion)}</div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 overflow-hidden rounded-lg border border-slate-300 bg-white text-sm font-medium">
            <button onClick={() => setViewMode('bracket')} className={`px-4 ${viewMode === 'bracket' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              대진표
            </button>
            <button onClick={() => setViewMode('list')} className={`border-l border-slate-300 px-4 ${viewMode === 'list' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              라운드 목록
            </button>
          </div>
          <select
            value={roundFilter}
            onChange={(event) => setRoundFilter(event.target.value === 'all' ? 'all' : Number(event.target.value))}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-emerald-500">
            <option value="all">전체 라운드</option>
            {koRounds.map((round) => {
              const match = koMatches.find((item) => item.round_order === round);
              return <option key={round} value={round}>{match?.round_name ?? `라운드 ${round}`}</option>;
            })}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {viewMode === 'bracket' ? (
            <div className="flex h-9 overflow-hidden rounded-lg border border-slate-300 bg-white">
              <button title="축소" onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))} className="w-9 text-lg text-slate-600 hover:bg-slate-50">−</button>
              <button title="화면에 맞춤" onClick={() => setZoom(0.9)} className="w-9 border-x border-slate-300 text-sm text-slate-600 hover:bg-slate-50">⛶</button>
              <button title="확대" onClick={() => setZoom((value) => Math.min(1.2, value + 0.1))} className="w-9 text-lg text-slate-600 hover:bg-slate-50">+</button>
            </div>
          ) : null}
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-slate-300" />진행 예정</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />완료</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400" />부전승</span>
          </div>
        </div>
      </div>

      {viewMode === 'bracket' ? (
        <div className="max-h-[72vh] overflow-auto border-y border-slate-200 bg-slate-50/70">
          <div className="flex min-w-max gap-10 p-4 origin-top-left" style={{ zoom }}>
            {visibleRounds.map((round) => {
              const roundIndex = koRounds.indexOf(round);
              const roundMatches = koMatches.filter((match) => match.round_order === round).sort((a, b) => a.slot - b.slot);
              const firstRoundCount = koMatches.filter((match) => match.round_order === koRounds[0]).length;
              const rowHeight = 116;
              const cardHeight = 94;
              const roundStep = 2 ** roundIndex;
              const bracketHeight = Math.max(firstRoundCount * rowHeight, rowHeight);
              const isSingleRound = visibleRounds.length === 1;
              return (
                <section key={round} className="w-64 shrink-0">
                  <div className="sticky top-0 z-10 mb-3 flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-1">
                    <h3 className="font-semibold text-slate-900">{roundMatches[0]?.round_name ?? `라운드 ${round}`}</h3>
                    <span className="text-xs text-slate-400">{roundMatches.length}경기</span>
                  </div>
                  <div
                    className={isSingleRound ? 'flex flex-col gap-3' : 'relative'}
                    style={isSingleRound ? undefined : { height: `${bracketHeight}px` }}>
                    {roundMatches.map((match) => {
                      const center = (match.slot * roundStep + roundStep / 2) * rowHeight;
                      const branchHalf = (roundStep * rowHeight) / 4;
                      return (
                        <div
                          key={match.id}
                          className={isSingleRound ? 'relative' : 'absolute left-0'}
                          style={isSingleRound ? undefined : { top: `${center - cardHeight / 2}px` }}>
                          {!isSingleRound && roundIndex > 0 ? (
                            <>
                              <span
                                className="pointer-events-none absolute right-full top-1/2 w-5 border-t border-slate-300"
                              />
                              <span
                                className="pointer-events-none absolute right-[calc(100%+20px)] border-l border-slate-300"
                                style={{ top: `calc(50% - ${branchHalf}px)`, height: `${branchHalf * 2}px` }}
                              />
                            </>
                          ) : null}
                          {!isSingleRound && roundIndex < koRounds.length - 1 ? (
                            <span className="pointer-events-none absolute left-full top-1/2 w-5 border-t border-slate-300" />
                          ) : null}
                          <BracketMatchCard
                            match={match}
                            name={name}
                            avatarOf={avatarOf}
                            courts={courts}
                            highlighted={!!q && matchHit(match)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleRounds.map((round) => {
            const roundMatches = koMatches.filter((match) => match.round_order === round).sort((a, b) => a.slot - b.slot);
            const shown = q ? roundMatches.filter(matchHit) : roundMatches;
            if (q && shown.length === 0) return null;
            return (
              <section key={round} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{roundMatches[0]?.round_name ?? `라운드 ${round}`}</h3>
                  <span className="text-xs text-slate-400">{roundMatches.length}경기</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {shown.map((match) => (
                    <MatchRow key={match.id} m={match} name={name} isOrganizer={isOrganizer} courts={courts} readOnly avatarOf={avatarOf} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
