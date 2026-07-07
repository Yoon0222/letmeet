'use client';

import { useParams } from 'next/navigation';

import { ENTRY_STATUS_LABEL } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { EntryStatus } from '@/lib/types';

import { useTournament } from './_ctx';

const ENTRY_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-600',
  withdrawn: 'bg-slate-100 text-slate-500',
};

export default function EntriesTab() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const { t, entries, courts, loading, reload, query } = useTournament();

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;
  if (!t) return <p className="text-slate-500">대회를 찾을 수 없습니다.</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const q = query.trim().toLowerCase();
  // 거절된 신청은 목록에서 숨기고, 검색어가 있으면 이름(닉/파트너)으로 필터
  const visibleEntries = entries
    .filter((e) => e.status !== 'rejected')
    .filter(
      (e) =>
        !q ||
        (e.profiles?.nickname ?? '').toLowerCase().includes(q) ||
        (e.partner?.nickname ?? e.partner_name ?? '').toLowerCase().includes(q),
    );

  async function setEntryStatus(userId: string, status: EntryStatus) {
    await supabase.from('tournament_entries').update({ status }).eq('tournament_id', id).eq('user_id', userId);
    reload();
  }

  return (
    <div>
      {courts.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-medium">코트 {courts.length}면</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-2 text-sm">
                <span className="font-medium text-slate-800">{c.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.indoor ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-700'}`}>
                  {c.indoor ? '실내' : '실외'}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <h2 className="text-lg font-medium">참가 신청 {visibleEntries.length}건</h2>
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
                    {t.discipline === 'doubles' && (e.partner?.nickname ?? e.partner_name) && (
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
