'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type { CourtRegistrationRequest, CourtRegRequestStatus } from '@/lib/types';

type Req = CourtRegistrationRequest & { requester: { id: string; nickname: string } | null };

const STATUS_LABEL: Record<CourtRegRequestStatus, string> = { pending: '대기', approved: '등록됨', rejected: '반려' };
const STATUS_STYLE: Record<CourtRegRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-500',
};

function CourtRequestsInner() {
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let req = supabase
      .from('court_registration_requests')
      .select('*, requester:profiles!requester_id(id,nickname)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'pending') req = req.eq('status', 'pending');
    const { data } = await req;
    setRows((data as unknown as Req[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // 승인 → 코트 생성 후 요청에 연결
  async function approve(r: Req) {
    if (!confirm(`'${r.name}' 을(를) 코트로 등록할까요?\n좌표·상세는 등록 후 코트 관리에서 채우면 돼요.`)) return;
    setBusy(r.id);
    const { data: court, error: e1 } = await supabase
      .from('courts')
      .insert({ name: r.name, region: r.region, address: r.address })
      .select('id')
      .single();
    if (e1) {
      setBusy(null);
      alert('코트 생성 실패: ' + e1.message);
      return;
    }
    const { error: e2 } = await supabase
      .from('court_registration_requests')
      .update({ status: 'approved', court_id: court.id })
      .eq('id', r.id);
    setBusy(null);
    if (e2) {
      alert('요청 처리 실패: ' + e2.message);
      return;
    }
    alert('코트로 등록됐어요. 코트 관리에서 좌표·운영시간·사진을 채워주세요.');
    load();
  }

  async function reject(id: string) {
    setBusy(id);
    const { error } = await supabase.from('court_registration_requests').update({ status: 'rejected' }).eq('id', id);
    setBusy(null);
    if (error) {
      alert('반려 실패: ' + error.message);
      return;
    }
    load();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">코트 등록 요청</h1>
      <p className="mt-1 text-sm text-slate-500">앱 사용자가 검색에 없어 요청한 코트를 확인하고, 승인하면 코트로 등록됩니다.</p>

      <div className="mt-4 flex gap-2 text-sm">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 font-medium ${filter === f ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-600 hover:bg-slate-100'}`}
          >
            {f === 'pending' ? '대기중' : '전체'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">{filter === 'pending' ? '대기 중인 요청이 없어요.' : '요청이 없어요.'}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">{r.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {r.region || '지역 미상'}{r.address ? ` · ${r.address}` : ''}
                  </p>
                  {r.note ? <p className="mt-1 text-sm text-slate-600">메모: {r.note}</p> : null}
                  <p className="mt-1 text-xs text-slate-400">요청: {r.requester?.nickname ?? '알 수 없음'} · {new Date(r.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
                {r.status === 'pending' ? (
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => approve(r)}
                      disabled={busy === r.id}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      코트로 등록
                    </button>
                    <button
                      onClick={() => reject(r.id)}
                      disabled={busy === r.id}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                    >
                      반려
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CourtRequestsPage() {
  return (
    <Protected>
      <CourtRequestsInner />
    </Protected>
  );
}
