'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { formatDateTime, TOURNAMENT_STATUS_LABEL } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { TournamentWithCounts } from '@/lib/types';

const STATUS_STYLE: Record<string, string> = {
  registration: 'bg-emerald-50 text-emerald-700',
  ongoing: 'bg-blue-50 text-blue-700',
  finished: 'bg-slate-100 text-slate-500',
  cancelled: 'bg-red-50 text-red-600',
};

function TournamentsInner() {
  const { session } = useSession();
  const [rows, setRows] = useState<TournamentWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const uid = session?.user.id;
    if (!uid) return;
    const { data } = await supabase
      .from('tournaments_with_counts')
      .select('*')
      .eq('organizer_id', uid)
      .order('start_at', { ascending: false });
    setRows(data ?? []);
    setLoading(false);
  }, [session?.user.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">내 대회</h1>
          <p className="mt-1 text-sm text-slate-500">개설한 대회를 운영하고 참가 신청을 관리하세요.</p>
        </div>
        <Link
          href="/tournaments/new"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          + 새 대회
        </Link>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          아직 개설한 대회가 없습니다. 첫 대회를 만들어보세요.
        </div>
      ) : (
        <div className="mt-6 grid gap-3">
          {rows.map((t) => (
            <Link
              key={t.id}
              href={`/tournaments/${t.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{formatDateTime(t.start_at)}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[t.status]}`}>
                  {TOURNAMENT_STATUS_LABEL[t.status]}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-medium">{t.title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {t.venue || '장소 미정'}
                {t.region ? ` · ${t.region}` : ''}
              </p>
              <div className="mt-3 flex gap-4 text-sm text-slate-600">
                <span>
                  승인 <b className="text-slate-900">{t.approved_count}</b>/{t.max_participants}
                </span>
                {t.pending_count > 0 && (
                  <span className="text-amber-600">대기 {t.pending_count}건</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TournamentsPage() {
  return (
    <Protected>
      <TournamentsInner />
    </Protected>
  );
}
