'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

import { MatchRow } from '@/components/match-row';
import {
  buildGroups,
  firstRoundPairs,
  groupCountForSize,
  roundName,
  standings,
} from '@/lib/bracket';
import { autoAdvanceCourts } from '@/lib/court-assign';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { TournamentMatch } from '@/lib/types';

import { useTournament } from '../_ctx';

export default function PrelimTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, entries, matches, courts, loading, reload, name } = useTournament();
  const [perGroupInput, setPerGroupInput] = useState(4);

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const unit = t.discipline === 'doubles' ? '팀' : '명';
  const approved = entries.filter((e) => e.status === 'approved');
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const koMatches = matches.filter((m) => m.phase === 'knockout');

  async function generateGroups() {
    const per = Math.max(2, perGroupInput);
    const gc = groupCountForSize(approved.length, per);
    const { rows } = buildGroups(approved.map((e) => e.user_id), gc);
    if (rows.length === 0) {
      alert('경기를 만들 수 없어요. 승인 인원과 조당 인원을 확인하세요.');
      return;
    }
    await supabase.from('tournament_matches').insert(
      rows.map((r) => ({
        tournament_id: id,
        phase: 'group' as const,
        group_no: r.group_no,
        slot: r.slot,
        entry1_id: r.entry1_id,
        entry2_id: r.entry2_id,
      })),
    );
    await supabase.from('tournaments').update({ group_count: gc, status: 'ongoing' }).eq('id', id);
    reload();
  }

  // 조별리그 없이 바로 본선 토너먼트 (참가 순서 시드)
  async function generateStraightKnockout() {
    const seeds = approved.map((e) => e.user_id);
    if (seeds.length < 2) return;
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
        winner_id: p[1] ? null : p[0],
        status: p[1] ? 'scheduled' : 'done',
      })),
    );
    await supabase.from('tournaments').update({ status: 'ongoing' }).eq('id', id);
    reload();
  }

  async function saveScore(m: TournamentMatch, s1: number, s2: number) {
    if (s1 === s2) {
      alert('무승부는 없어요. 점수를 다르게 입력하세요.');
      return;
    }
    const winner_id = s1 > s2 ? m.entry1_id : m.entry2_id;
    await supabase.from('tournament_matches').update({ score1: s1, score2: s2, winner_id, status: 'done' }).eq('id', m.id);
    // 경기가 끝나 코트가 비면 대기 경기를 자동 투입(미확정)
    if (courts.length > 0) await autoAdvanceCourts(id);
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

  async function assignCourt(m: TournamentMatch, courtId: string | null) {
    await supabase.from('tournament_matches').update({ court_id: courtId }).eq('id', m.id);
    reload();
  }

  // 조별리그 없이 바로 본선으로 진행하는 대회
  if (groupMatches.length === 0 && koMatches.length > 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        이 대회는 조별리그 없이 바로 본선으로 진행돼요.{' '}
        <Link href={`/tournaments/${id}/final`} className="font-medium text-emerald-700 hover:underline">
          본선 탭에서 확인하기 →
        </Link>
      </div>
    );
  }

  // 대진 생성 전
  if (groupMatches.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {approved.length < 2 ? (
          <p className="text-sm text-slate-500">참가 승인이 2{unit} 이상이면 조별리그를 만들 수 있어요.</p>
        ) : !isOrganizer ? (
          <p className="text-sm text-slate-500">아직 대진이 생성되지 않았습니다.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">
                조당 {t.discipline === 'doubles' ? '팀 수' : '인원'} (승인 {approved.length}{unit})
              </span>
              <input type="number" min={2} value={perGroupInput} onChange={(e) => setPerGroupInput(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>
            <button onClick={generateGroups} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
              조별리그 생성 ({groupCountForSize(approved.length, Math.max(2, perGroupInput))}개 조)
            </button>
            <button onClick={generateStraightKnockout} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">
              조별리그 없이 바로 본선
            </button>
          </div>
        )}
      </div>
    );
  }

  // 조별리그 진행
  const gc = t.group_count ?? 0;
  return (
    <div className="space-y-4">
      {Array.from({ length: gc }, (_, gi) => gi + 1).map((g) => {
        const gm = groupMatches.filter((m) => m.group_no === g);
        const members = Array.from(new Set(gm.flatMap((m) => [m.entry1_id, m.entry2_id]).filter(Boolean) as string[]));
        const st = standings(members, gm);
        return (
          <div key={g} className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="font-medium">{g}조</h3>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-1 font-medium">순위</th>
                  <th className="py-1 font-medium">닉네임</th>
                  <th className="py-1 font-medium">승</th>
                  <th className="py-1 font-medium">득실</th>
                </tr>
              </thead>
              <tbody>
                {st.map((s, i) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1 font-medium">{name(s.id)}</td>
                    <td className="py-1">{s.wins}</td>
                    <td className="py-1">{s.diff > 0 ? '+' : ''}{s.diff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 space-y-1.5">
              {gm.map((m) => (
                <MatchRow key={m.id} m={m} name={name} isOrganizer={isOrganizer} courts={courts} onSave={saveScore} onNotify={notifyTurn} onAssignCourt={assignCourt} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
