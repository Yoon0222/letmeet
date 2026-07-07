'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { MatchRow } from '@/components/match-row';
import {
  firstRoundPairs,
  nextRoundPairs,
  roundName,
  seedQualifiersTotal,
  standings,
  type Standing,
} from '@/lib/bracket';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { TournamentMatch } from '@/lib/types';

import { useTournament } from '../_ctx';

export default function FinalTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, matches, loading, reload, name } = useTournament();
  const [advanceInput, setAdvanceInput] = useState(4);

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const unit = t.discipline === 'doubles' ? '팀' : '명';
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const koMatches = matches.filter((m) => m.phase === 'knockout');
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'done');

  async function saveScore(m: TournamentMatch, s1: number, s2: number) {
    if (s1 === s2) {
      alert('무승부는 없어요. 점수를 다르게 입력하세요.');
      return;
    }
    const winner_id = s1 > s2 ? m.entry1_id : m.entry2_id;
    await supabase.from('tournament_matches').update({ score1: s1, score2: s2, winner_id, status: 'done' }).eq('id', m.id);
    reload();
  }

  async function notifyTurn(m: TournamentMatch) {
    const { data, error } = await supabase.functions.invoke('notify-turn', { body: { match_id: m.id } });
    if (error) {
      alert(`알림 전송 실패: ${error.message}`);
      return;
    }
    const sent = (data as { sent?: number })?.sent ?? 0;
    alert(sent > 0 ? `차례 알림을 ${sent}명에게 보냈어요.` : '알림 받을 수 있는 선수가 없어요(푸시 토큰 없음).');
  }

  async function generateKnockout() {
    const gc = t?.group_count ?? 0;
    const byGroup: Standing[][] = [];
    for (let g = 1; g <= gc; g++) {
      const gm = groupMatches.filter((m) => m.group_no === g);
      const members = Array.from(new Set(gm.flatMap((m) => [m.entry1_id, m.entry2_id]).filter(Boolean) as string[]));
      byGroup.push(standings(members, gm));
    }
    const seeds = seedQualifiersTotal(byGroup, advanceInput);
    if (seeds.length < 2) {
      alert('진출자가 2명 이상이어야 토너먼트를 만들 수 있어요.');
      return;
    }
    let size = 1;
    while (size < seeds.length) size *= 2;
    const pairs = firstRoundPairs(seeds);
    await supabase.from('tournament_matches').insert(
      pairs.map((p, i) => ({
        tournament_id: id,
        phase: 'knockout' as const,
        round_order: 1,
        round_name: roundName(size),
        slot: i,
        entry1_id: p[0],
        entry2_id: p[1],
        winner_id: p[1] ? null : p[0], // 부전승 자동 처리
        status: p[1] ? 'scheduled' : 'done',
      })),
    );
    await supabase.from('tournaments').update({ advance_per_group: advanceInput }).eq('id', id);
    reload();
  }

  async function generateNextRound() {
    const maxRound = Math.max(...koMatches.map((m) => m.round_order ?? 0));
    const cur = koMatches.filter((m) => m.round_order === maxRound).sort((a, b) => a.slot - b.slot);
    const winners = cur.map((m) => m.winner_id).filter(Boolean) as string[];
    const pairs = nextRoundPairs(winners);
    await supabase.from('tournament_matches').insert(
      pairs.map((p, i) => ({
        tournament_id: id,
        phase: 'knockout' as const,
        round_order: maxRound + 1,
        round_name: roundName(winners.length),
        slot: i,
        entry1_id: p[0],
        entry2_id: p[1],
        winner_id: p[1] ? null : p[0],
        status: p[1] ? 'scheduled' : 'done',
      })),
    );
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
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-5">
        <label className="text-sm">
          <span className="mb-1 block text-slate-600">본선 진출 {t.discipline === 'doubles' ? '팀 수' : '인원'} (총)</span>
          <input type="number" min={2} value={advanceInput} onChange={(e) => setAdvanceInput(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </label>
        <button onClick={generateKnockout} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          본선 토너먼트 생성
        </button>
        <span className="pb-2 text-xs text-slate-400">
          상위 {advanceInput}{unit} 진출 → {roundName((() => { let s = 1; while (s < Math.max(2, advanceInput)) s *= 2; return s; })())} (부족분은 상위 시드 부전승)
        </span>
      </div>
    );
  }

  // 본선 진행 — 우승자 판정
  const maxRound = Math.max(...koMatches.map((m) => m.round_order ?? 0));
  const curKo = koMatches.filter((m) => m.round_order === maxRound);
  const curKoDone = curKo.length > 0 && curKo.every((m) => m.status === 'done');
  const champion = maxRound > 0 && curKo.length === 1 && curKoDone ? curKo[0].winner_id : null;
  const koRounds = Array.from(new Set(koMatches.map((m) => m.round_order))).sort((a, b) => (a ?? 0) - (b ?? 0));

  return (
    <div className="space-y-4">
      {champion && (
        <div className="rounded-xl bg-amber-50 p-4 text-center ring-1 ring-amber-200">
          <div className="text-sm text-amber-700">🏆 우승</div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{name(champion)}</div>
        </div>
      )}
      {koRounds.map((r) => {
        const rm = koMatches.filter((m) => m.round_order === r).sort((a, b) => a.slot - b.slot);
        return (
          <div key={r} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-medium">{rm[0]?.round_name ?? `라운드 ${r}`}</h3>
            <div className="mt-2 space-y-1.5">
              {rm.map((m) => (
                <MatchRow key={m.id} m={m} name={name} isOrganizer={isOrganizer} onSave={saveScore} onNotify={notifyTurn} />
              ))}
            </div>
          </div>
        );
      })}
      {isOrganizer && !champion && curKoDone && curKo.length > 1 && (
        <button onClick={generateNextRound} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
          다음 라운드 생성
        </button>
      )}
    </div>
  );
}
