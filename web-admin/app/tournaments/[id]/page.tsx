'use client';

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
import type { EntryStatus, TournamentEntryWithProfile, TournamentStatus, TournamentWithCounts } from '@/lib/types';

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
        .select('*, profiles(id, nickname, skill_level, avatar_url, region)')
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // load 는 비동기로 await 이후 setState 를 호출한다 (동기 cascading 렌더 아님)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isOrganizer = !!t && t.organizer_id === session?.user.id;

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
            {formatDateTime(t.start_at)} · {t.venue || '장소 미정'}
            {t.region ? ` · ${t.region}` : ''}
          </p>
        </div>
        {isOrganizer && (
          <div className="flex flex-wrap justify-end gap-2">
            {t.status === 'registration' && (
              <button onClick={() => setTournamentStatus('ongoing')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
                접수 마감 (진행중)
              </button>
            )}
            {t.status === 'ongoing' && (
              <button onClick={() => setTournamentStatus('finished')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
                대회 종료
              </button>
            )}
            {t.status !== 'cancelled' && t.status !== 'finished' && (
              <button onClick={() => setTournamentStatus('cancelled')} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">
                취소
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="정원" value={`${t.approved_count}/${t.max_participants}`} />
        <Stat label="대기" value={`${t.pending_count}건`} />
        <Stat label="실력" value={skillRange(t.skill_min, t.skill_max)} />
        <Stat label="참가비" value={t.fee > 0 ? `${t.fee.toLocaleString()}원` : '무료'} />
      </div>

      {t.description && (
        <p className="mt-5 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {t.description}
        </p>
      )}

      <h2 className="mt-8 text-lg font-medium">참가 신청 {entries.length}건</h2>
      {entries.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">아직 신청이 없습니다.</p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">닉네임</th>
                <th className="px-4 py-2 font-medium">실력</th>
                <th className="px-4 py-2 font-medium">지역</th>
                <th className="px-4 py-2 font-medium">상태</th>
                {isOrganizer && <th className="px-4 py-2 font-medium">관리</th>}
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.user_id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{e.profiles?.nickname ?? '알 수 없음'}</td>
                  <td className="px-4 py-2">{e.profiles ? e.profiles.skill_level.toFixed(1) : '-'}</td>
                  <td className="px-4 py-2 text-slate-500">{e.profiles?.region || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ENTRY_STYLE[e.status]}`}>
                      {ENTRY_STATUS_LABEL[e.status]}
                    </span>
                  </td>
                  {isOrganizer && (
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        {e.status !== 'approved' && (
                          <button onClick={() => setEntryStatus(e.user_id, 'approved')} className="text-emerald-600 hover:underline">
                            승인
                          </button>
                        )}
                        {e.status !== 'rejected' && (
                          <button onClick={() => setEntryStatus(e.user_id, 'rejected')} className="text-red-600 hover:underline">
                            거절
                          </button>
                        )}
                        {e.status !== 'pending' && (
                          <button onClick={() => setEntryStatus(e.user_id, 'pending')} className="text-slate-500 hover:underline">
                            대기로
                          </button>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
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
