'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { AuditLogWithActor } from '@/lib/types';

const ROLE_LABEL: Record<string, string> = {
  player: '플레이어',
  organizer: '대회 운영자',
  court_manager: '코트 관리자',
  super_admin: '슈퍼관리자',
};

const ENTRY_STATUS: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '거절',
  withdrawn: '철회',
  waitlist: '대기열',
};

type Json = Record<string, unknown> | null;

// 행위를 사람이 읽는 라벨로
function actionLabel(log: AuditLogWithActor): string {
  const o = log.old_data as Json;
  const n = log.new_data as Json;
  switch (log.action) {
    case 'tournament_entries.INSERT':
      return '참가 신청';
    case 'tournament_entries.UPDATE': {
      const ns = n?.status as string | undefined;
      if (ns === 'approved') return '참가 승인';
      if (ns === 'rejected') return '참가 거절';
      return '참가 상태 변경';
    }
    case 'tournament_entries.DELETE':
      return '참가 취소';
    case 'tournaments.INSERT':
      return '대회 개설';
    case 'tournaments.UPDATE':
      return '대회 수정';
    case 'tournaments.DELETE':
      return '대회 삭제';
    case 'tournament_matches.INSERT':
      return '대진 생성';
    case 'tournament_matches.UPDATE':
      return '경기 결과 입력';
    case 'tournament_matches.DELETE':
      return '대진 삭제';
    case 'profiles.UPDATE':
      if ((o?.role as string) !== (n?.role as string)) return '권한 변경';
      return '프로필 변경';
    default:
      return log.action;
  }
}

// 변경 상세(어떻게)
function detailText(log: AuditLogWithActor): string {
  const o = log.old_data as Json;
  const n = log.new_data as Json;
  switch (log.action) {
    case 'tournament_entries.INSERT':
    case 'tournament_entries.UPDATE': {
      const os = o?.status as string | undefined;
      const ns = n?.status as string | undefined;
      const partner = n?.partner_name as string | undefined;
      const base =
        os && ns && os !== ns
          ? `${ENTRY_STATUS[os] ?? os} → ${ENTRY_STATUS[ns] ?? ns}`
          : `상태 ${ENTRY_STATUS[ns ?? ''] ?? ns ?? ''}`;
      return partner ? `${base} · 파트너 ${partner}` : base;
    }
    case 'tournament_entries.DELETE':
      return `상태 ${ENTRY_STATUS[(o?.status as string) ?? ''] ?? ''}`;
    case 'tournaments.INSERT':
    case 'tournaments.UPDATE':
    case 'tournaments.DELETE':
      return (n?.title as string) ?? (o?.title as string) ?? '';
    case 'tournament_matches.UPDATE': {
      const s1 = n?.score1;
      const s2 = n?.score2;
      return s1 != null && s2 != null ? `점수 ${s1} : ${s2}` : (n?.status as string) ?? '';
    }
    case 'profiles.UPDATE': {
      const or = o?.role as string | undefined;
      const nr = n?.role as string | undefined;
      if (or !== nr) return `${ROLE_LABEL[or ?? ''] ?? or} → ${ROLE_LABEL[nr ?? ''] ?? nr}`;
      return '';
    }
    default:
      return '';
  }
}

const PAGE_SIZE = 20;

function AuditInner() {
  const [rows, setRows] = useState<AuditLogWithActor[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const { data, count } = await supabase
      .from('audit_logs')
      .select('*, actor:profiles!audit_logs_actor_id_fkey(id, nickname)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    setRows((data as unknown as AuditLogWithActor[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(page);
  }, [load, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">감사 로그</h1>
          <p className="mt-1 text-sm text-slate-500">
            누가·무엇을·언제·어떻게 했는지 기록합니다. (총 {total}건)
          </p>
        </div>
        <button
          onClick={() => load(page)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
          새로고침
        </button>
      </div>

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center text-slate-500">
          아직 기록이 없습니다.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">시간</th>
                <th className="px-4 py-2 font-medium">행위자</th>
                <th className="px-4 py-2 font-medium">역할</th>
                <th className="px-4 py-2 font-medium">행위</th>
                <th className="px-4 py-2 font-medium">상세</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-4 py-2 font-medium">{log.actor?.nickname ?? '시스템'}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {log.actor_role ? ROLE_LABEL[log.actor_role] ?? log.actor_role : '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {actionLabel(log)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{detailText(log)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이징 */}
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {page + 1} / {totalPages} 페이지 · 총 {total}건
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1 || loading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Protected superAdmin>
      <AuditInner />
    </Protected>
  );
}
