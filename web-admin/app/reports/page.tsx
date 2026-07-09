'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type { ReportStatus, ReportWithNames } from '@/lib/types';

const TARGET_LABEL: Record<string, string> = { meetup: '번개모임', club: '클럽', profile: '프로필', tournament: '대회' };
const STATUS_LABEL: Record<ReportStatus, string> = { open: '대기', reviewed: '처리됨', dismissed: '기각' };
const STATUS_STYLE: Record<ReportStatus, string> = {
  open: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-slate-100 text-slate-500',
};

function ReportsInner() {
  const [rows, setRows] = useState<ReportWithNames[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    setLoading(true);
    let req = supabase
      .from('reports')
      .select('*, reporter:profiles!reporter_id(id,nickname), target_user:profiles!target_user_id(id,nickname)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'open') req = req.eq('status', 'open');
    const { data } = await req;
    setRows((data as unknown as ReportWithNames[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  async function setStatus(id: string, status: ReportStatus) {
    const { error } = await supabase.from('reports').update({ status }).eq('id', id);
    if (error) {
      alert('상태 변경 실패: ' + error.message);
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">신고 관리</h1>
      <p className="mt-1 text-sm text-slate-500">사용자가 신고한 콘텐츠를 확인하고 처리합니다.</p>

      <div className="mt-4 flex gap-2 text-sm">
        {(['open', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1.5 ${filter === f ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {f === 'open' ? '대기 중' : '전체'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">{filter === 'open' ? '대기 중인 신고가 없습니다.' : '신고 내역이 없습니다.'}</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">일시</th>
                <th className="px-4 py-2 font-medium">대상</th>
                <th className="px-4 py-2 font-medium">사유</th>
                <th className="px-4 py-2 font-medium">신고자</th>
                <th className="px-4 py-2 font-medium">피신고자</th>
                <th className="px-4 py-2 font-medium">상태</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 align-top">
                  <td className="px-4 py-2 text-slate-500">{new Date(r.created_at).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{TARGET_LABEL[r.target_type] ?? r.target_type}</span>
                    <div className="mt-1 font-mono text-xs text-slate-400">{r.target_id.slice(0, 8)}</div>
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {r.reason}
                    {r.detail ? <div className="mt-0.5 text-xs text-slate-500">{r.detail}</div> : null}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{r.reporter?.nickname ?? '-'}</td>
                  <td className="px-4 py-2 text-slate-500">{r.target_user?.nickname ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {r.status === 'open' ? (
                      <>
                        <button onClick={() => setStatus(r.id, 'reviewed')} className="mr-3 text-emerald-700 hover:underline">
                          처리
                        </button>
                        <button onClick={() => setStatus(r.id, 'dismissed')} className="text-slate-400 hover:text-slate-700 hover:underline">
                          기각
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setStatus(r.id, 'open')} className="text-slate-400 hover:underline">
                        되돌리기
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Protected>
      <ReportsInner />
    </Protected>
  );
}
