'use client';

import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/lib/types';

const ROLES: UserRole[] = ['player', 'organizer', 'court_manager', 'super_admin'];
const ROLE_LABEL: Record<UserRole, string> = {
  player: '플레이어',
  organizer: '대회 운영자',
  court_manager: '코트 관리자',
  super_admin: '슈퍼관리자',
};
const ROLE_STYLE: Record<UserRole, string> = {
  player: 'text-slate-500',
  organizer: 'text-emerald-700',
  court_manager: 'text-blue-700',
  super_admin: 'text-purple-700',
};

const PAGE_SIZE = 20;

function UsersInner() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (p: number, term: string) => {
    setLoading(true);
    let req = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    const t = term.trim();
    if (t) req = req.ilike('nickname', `%${t}%`);
    const from = p * PAGE_SIZE;
    const { data, count } = await req.range(from, from + PAGE_SIZE - 1);
    setRows(data ?? []);
    setTotal(count ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    // 검색 입력 디바운스(250ms), 페이지 이동도 동일 경로
    const timer = setTimeout(() => load(page, q), 250);
    return () => clearTimeout(timer);
  }, [load, page, q]);

  async function changeRole(id: string, role: UserRole) {
    setSaving(id);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    setSaving(null);
    if (error) {
      alert('역할 변경 실패: ' + error.message);
      return;
    }
    load(page, q);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="text-2xl font-semibold">사용자 관리</h1>
      <p className="mt-1 text-sm text-slate-500">
        사용자에게 역할을 부여합니다. 대회 개설은 <b>대회 운영자</b> 이상만 가능합니다.
      </p>

      <input
        placeholder="닉네임 검색"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
        className="mt-4 w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />

      {loading ? (
        <p className="mt-8 text-slate-500">불러오는 중…</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">닉네임</th>
                <th className="px-4 py-2 font-medium">지역</th>
                <th className="px-4 py-2 font-medium">실력</th>
                <th className="px-4 py-2 font-medium">현재 역할</th>
                <th className="px-4 py-2 font-medium">역할 변경</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-medium">{p.nickname}</td>
                  <td className="px-4 py-2 text-slate-500">{p.region || '-'}</td>
                  <td className="px-4 py-2">{p.skill_level?.toFixed(1) ?? '-'}</td>
                  <td className={`px-4 py-2 font-medium ${ROLE_STYLE[p.role]}`}>{ROLE_LABEL[p.role]}</td>
                  <td className="px-4 py-2">
                    <select
                      value={p.role}
                      disabled={saving === p.id}
                      onChange={(e) => changeRole(p.id, e.target.value as UserRole)}
                      className="rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500 disabled:opacity-50"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 페이징 */}
      {!loading && total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <span>
            {page + 1} / {totalPages} 페이지 · 총 {total}명
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              이전
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              다음
            </button>
          </div>
        </div>
      )}
      {!loading && total === 0 && (
        <p className="mt-6 text-sm text-slate-500">{q ? '검색 결과가 없어요.' : '사용자가 없습니다.'}</p>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Protected superAdmin>
      <UsersInner />
    </Protected>
  );
}
