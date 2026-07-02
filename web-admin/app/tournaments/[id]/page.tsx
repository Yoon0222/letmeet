'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import {
  buildGroups,
  firstRoundPairs,
  nextRoundPairs,
  roundName,
  seedQualifiers,
  standings,
  type Standing,
} from '@/lib/bracket';
import {
  ENTRY_STATUS_LABEL,
  formatDateTime,
  skillRange,
  TOURNAMENT_STATUS_LABEL,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type {
  EntryStatus,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentStatus,
  TournamentWithCounts,
} from '@/lib/types';

const ENTRY_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  withdrawn: 'bg-slate-100 text-slate-500',
};

function DetailInner() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupInput, setGroupInput] = useState(2);
  const [advanceInput, setAdvanceInput] = useState(2);

  const load = useCallback(async () => {
    const [{ data: tour }, { data: ents }, { data: ms }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('tournament_matches').select('*').eq('tournament_id', id).order('slot', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setMatches((ms as TournamentMatch[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isOrganizer = !!t && (t.organizer_id === session?.user.id);
  const name = (uid: string | null) =>
    !uid ? '부전승' : entries.find((e) => e.user_id === uid)?.profiles?.nickname ?? '알 수 없음';

  const approved = entries.filter((e) => e.status === 'approved');
  const groupMatches = matches.filter((m) => m.phase === 'group');
  const koMatches = matches.filter((m) => m.phase === 'knockout');
  const groupsDone = groupMatches.length > 0 && groupMatches.every((m) => m.status === 'done');

  async function setEntryStatus(userId: string, status: EntryStatus) {
    await supabase.from('tournament_entries').update({ status }).eq('tournament_id', id).eq('user_id', userId);
    load();
  }
  async function setTournamentStatus(status: TournamentStatus) {
    await supabase.from('tournaments').update({ status }).eq('id', id);
    load();
  }

  async function generateGroups() {
    const gc = Math.max(1, Math.min(groupInput, approved.length));
    const { rows } = buildGroups(approved.map((e) => e.user_id), gc);
    if (rows.length === 0) {
      alert('경기를 만들 수 없어요. 조당 2명 이상이 되도록 조 개수를 줄이세요.');
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
    load();
  }

  async function saveScore(m: TournamentMatch, s1: number, s2: number) {
    if (s1 === s2) {
      alert('무승부는 없어요. 점수를 다르게 입력하세요.');
      return;
    }
    const winner_id = s1 > s2 ? m.entry1_id : m.entry2_id;
    await supabase
      .from('tournament_matches')
      .update({ score1: s1, score2: s2, winner_id, status: 'done' })
      .eq('id', m.id);
    load();
  }

  async function generateKnockout() {
    const gc = t?.group_count ?? 0;
    const adv = Math.max(1, advanceInput);
    const byGroup: Standing[][] = [];
    for (let g = 1; g <= gc; g++) {
      const gm = groupMatches.filter((m) => m.group_no === g);
      const members = Array.from(new Set(gm.flatMap((m) => [m.entry1_id, m.entry2_id]).filter(Boolean) as string[]));
      byGroup.push(standings(members, gm));
    }
    const seeds = seedQualifiers(byGroup, adv);
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
    await supabase.from('tournaments').update({ advance_per_group: adv }).eq('id', id);
    load();
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
    load();
  }

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  // 우승자 판정
  const maxRound = koMatches.length ? Math.max(...koMatches.map((m) => m.round_order ?? 0)) : 0;
  const curKo = koMatches.filter((m) => m.round_order === maxRound);
  const curKoDone = curKo.length > 0 && curKo.every((m) => m.status === 'done');
  const champion = maxRound > 0 && curKo.length === 1 && curKoDone ? curKo[0].winner_id : null;

  const koRounds = Array.from(new Set(koMatches.map((m) => m.round_order))).sort((a, b) => (a ?? 0) - (b ?? 0));

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm text-slate-500">{TOURNAMENT_STATUS_LABEL[t.status]}</span>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatDateTime(t.start_at)} · {t.venue || '장소 미정'}
            {t.region ? ` · ${t.region}` : ''} · 정원 {t.approved_count}/{t.max_participants}
            {' · '}실력 {skillRange(t.skill_min, t.skill_max)}
          </p>
        </div>
        {isOrganizer && t.status !== 'cancelled' && t.status !== 'finished' && (
          <button onClick={() => setTournamentStatus('finished')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            대회 종료
          </button>
        )}
      </div>

      {/* 참가 신청 */}
      <h2 className="mt-8 text-lg font-medium">참가 신청 {entries.length}건</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">아직 신청이 없습니다.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">닉네임</th>
                <th className="px-4 py-2 font-medium">실력</th>
                <th className="px-4 py-2 font-medium">상태</th>
                {isOrganizer && <th className="px-4 py-2 font-medium">관리</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{e.profiles?.nickname ?? '알 수 없음'}</td>
                  <td className="px-4 py-2">{e.profiles ? e.profiles.skill_level.toFixed(1) : '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENTRY_STYLE[e.status]}`}>
                      {ENTRY_STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  {isOrganizer && (
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {e.status !== 'approved' && (
                          <button onClick={() => setEntryStatus(e.user_id, 'approved')} className="text-emerald-600 hover:underline">승인</button>
                        )}
                        {e.status !== 'rejected' && (
                          <button onClick={() => setEntryStatus(e.user_id, 'rejected')} className="text-red-600 hover:underline">거절</button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 대회 진행 */}
      <h2 className="mt-10 text-lg font-medium">대회 진행</h2>

      {champion && (
        <div className="mt-3 rounded-xl bg-amber-50 p-4 text-center ring-1 ring-amber-200">
          <div className="text-sm text-amber-700">🏆 우승</div>
          <div className="mt-1 text-2xl font-semibold text-amber-900">{name(champion)}</div>
        </div>
      )}

      {/* 대진 생성 전 */}
      {groupMatches.length === 0 && koMatches.length === 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          {approved.length < 2 ? (
            <p className="text-sm text-slate-500">참가 승인이 2명 이상이면 조별리그 대진을 만들 수 있어요.</p>
          ) : !isOrganizer ? (
            <p className="text-sm text-slate-500">아직 대진이 생성되지 않았습니다.</p>
          ) : (
            <div className="flex items-end gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-slate-600">조 개수 (승인 {approved.length}명)</span>
                <input type="number" min={1} max={approved.length} value={groupInput} onChange={(e) => setGroupInput(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <button onClick={generateGroups} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                조별리그 대진 생성
              </button>
            </div>
          )}
        </div>
      )}

      {/* 조별리그 */}
      {t.group_count && groupMatches.length > 0 && (
        <div className="mt-4 space-y-4">
          {Array.from({ length: t.group_count }, (_, gi) => gi + 1).map((g) => {
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
                    <MatchRow key={m.id} m={m} name={name} isOrganizer={isOrganizer} onSave={saveScore} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 토너먼트 생성 */}
      {groupsDone && koMatches.length === 0 && isOrganizer && (
        <div className="mt-4 flex items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <label className="text-sm">
            <span className="mb-1 block text-slate-600">조별 진출 인원</span>
            <input type="number" min={1} value={advanceInput} onChange={(e) => setAdvanceInput(Number(e.target.value))} className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button onClick={generateKnockout} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            본선 토너먼트 생성
          </button>
          <span className="pb-2 text-xs text-slate-400">각 조 상위 {advanceInput}명이 진출 → 총 {(t.group_count ?? 0) * advanceInput}명</span>
        </div>
      )}

      {/* 토너먼트 라운드 */}
      {koMatches.length > 0 && (
        <div className="mt-4 space-y-4">
          {koRounds.map((r) => {
            const rm = koMatches.filter((m) => m.round_order === r).sort((a, b) => a.slot - b.slot);
            return (
              <div key={r} className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="font-medium">{rm[0]?.round_name ?? `라운드 ${r}`}</h3>
                <div className="mt-2 space-y-1.5">
                  {rm.map((m) => (
                    <MatchRow key={m.id} m={m} name={name} isOrganizer={isOrganizer} onSave={saveScore} />
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
      )}
    </div>
  );
}

function MatchRow({
  m,
  name,
  isOrganizer,
  onSave,
}: {
  m: TournamentMatch;
  name: (uid: string | null) => string;
  isOrganizer: boolean;
  onSave: (m: TournamentMatch, s1: number, s2: number) => void;
}) {
  const [s1, setS1] = useState<string>(m.score1?.toString() ?? '');
  const [s2, setS2] = useState<string>(m.score2?.toString() ?? '');
  const done = m.status === 'done';
  const bye = !m.entry2_id;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className={`flex-1 ${done && m.winner_id === m.entry1_id ? 'font-semibold text-emerald-700' : ''}`}>
        {name(m.entry1_id)}
      </span>
      {bye ? (
        <span className="text-xs text-slate-400">부전승</span>
      ) : done && !isOrganizer ? (
        <span className="tabular-nums">{m.score1} : {m.score2}</span>
      ) : isOrganizer ? (
        <div className="flex items-center gap-1">
          <input value={s1} onChange={(e) => setS1(e.target.value)} inputMode="numeric" className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center" />
          <span className="text-slate-400">:</span>
          <input value={s2} onChange={(e) => setS2(e.target.value)} inputMode="numeric" className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center" />
          <button
            onClick={() => onSave(m, Number(s1), Number(s2))}
            disabled={s1 === '' || s2 === ''}
            className="ml-1 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-40"
          >
            저장
          </button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">예정</span>
      )}
      <span className={`flex-1 text-right ${done && m.winner_id === m.entry2_id ? 'font-semibold text-emerald-700' : ''}`}>
        {name(m.entry2_id)}
      </span>
    </div>
  );
}

export default function TournamentDetailPage() {
  return (
    <Protected>
      <DetailInner />
    </Protected>
  );
}
