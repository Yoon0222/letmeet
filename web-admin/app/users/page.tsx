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

function UsersInner() {
  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function changeRole(id: string, role: UserRole) {
    setSaving(id);
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    setSaving(null);
    if (error) {
      alert('역할 변경 실패: ' + error.message);
      return;
    }
    load();
  }

  const visible = q
    ? rows.filter((r) => r.nickname.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <div>
      <h1 className="text-2xl font-semibold">사용자 관리</h1>
      <p className="mt-1 text-sm text-slate-500">
        사용자에게 역할을 부여합니다. 대회 개설은 <b>대회 운영자</b> 이상만 가능합니다.
      </p>

      <input
        placeholder="닉네임 검색"
        value={q}
        onChange={(e) => setQ(e.target.value)}
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
              {visible.map((p) => (
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
