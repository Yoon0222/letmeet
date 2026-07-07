'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
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
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: tour }, { data: ents }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select(
          '*, profiles:profiles!tournament_entries_user_id_fkey(id, nickname, skill_level, avatar_url, region), partner:profiles!tournament_entries_partner_id_fkey(id, nickname, skill_level, avatar_url, region)',
        )
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isOrganizer = !!t && (t.organizer_id === session?.user.id);
  const approved = entries.filter((e) => e.status === 'approved');
  // 거절된 신청은 목록에서 숨긴다
  const visibleEntries = entries.filter((e) => e.status !== 'rejected');

  async function setEntryStatus(userId: string, status: EntryStatus) {
    await supabase.from('tournament_entries').update({ status }).eq('tournament_id', id).eq('user_id', userId);
    load();
  }
  async function setTournamentStatus(status: TournamentStatus) {
    await supabase.from('tournaments').update({ status }).eq('id', id);
    load();
  }

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm text-slate-500">{TOURNAMENT_STATUS_LABEL[t.status]}</span>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t.discipline === 'doubles' ? '복식' : '단식'} · {formatDateTime(t.start_at)} · {t.venue || '장소 미정'}
            {t.region ? ` · ${t.region}` : ''} · 정원 {t.approved_count}/{t.max_participants}{t.discipline === 'doubles' ? '팀' : '명'}
            {' · '}실력 {skillRange(t.skill_min, t.skill_max)}
          </p>
        </div>
        {isOrganizer && t.status !== 'cancelled' && t.status !== 'finished' && (
          <button onClick={() => setTournamentStatus('finished')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            대회 종료
          </button>
        )}
      </div>

      {/* 대진 관리 진입 */}
      <Link
        href={`/tournaments/${id}/bracket`}
        className="mt-6 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 transition hover:bg-emerald-100"
      >
        <div>
          <div className="font-medium text-emerald-900">대진 관리 (조별리그 · 본선)</div>
          <div className="mt-0.5 text-sm text-emerald-700">
            승인 {approved.length}{t.discipline === 'doubles' ? '팀' : '명'} · 조별리그/토너먼트 생성과 경기 진행을 이곳에서
          </div>
        </div>
        <span className="text-xl text-emerald-700">→</span>
      </Link>

      {/* 참가 신청 */}
      <h2 className="mt-8 text-lg font-medium">참가 신청 {visibleEntries.length}건</h2>
      {visibleEntries.length === 0 ? (
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
              {visibleEntries.map((e) => (
                <tr key={e.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">
                    {e.profiles?.nickname ?? '알 수 없음'}
                    {t?.discipline === 'doubles' && (e.partner?.nickname ?? e.partner_name) && (
                      <span className="text-slate-500"> / {e.partner?.nickname ?? e.partner_name}</span>
                    )}
                  </td>
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
