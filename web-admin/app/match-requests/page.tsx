'use client';

// 경기 수정·삭제 요청 처리 (0085) — DUPR 등록된 번개 경기는 호스트가 직접 못 고치고
// 여기서 운영자가 검토 후 실행한다. 실행 시 DUPR UAT/운영에 match/update·delete 가 반영된다.
import { useCallback, useEffect, useState } from 'react';

import { Protected } from '@/components/protected';
import { supabase } from '@/lib/supabase';
import { useRole } from '@/lib/use-role';
import type { MatchChangeRequest, MeetupMatchRow } from '@/lib/types';

type Req = MatchChangeRequest & { requester: { id: string; nickname: string } | null };

const STATUS_LABEL: Record<MatchChangeRequest['status'], string> = { pending: '대기', done: '처리됨', rejected: '반려' };
const STATUS_STYLE: Record<MatchChangeRequest['status'], string> = {
  pending: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-500',
};

function MatchRequestsInner() {
  const { role } = useRole();
  const [rows, setRows] = useState<Req[]>([]);
  const [matches, setMatches] = useState<Record<string, MeetupMatchRow>>({});
  const [meetupTitles, setMeetupTitles] = useState<Record<string, string>>({});
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  // 수정 실행용 점수 편집 상태 (요청 id → 게임 점수 문자열)
  const [editGames, setEditGames] = useState<Record<string, { a: string; b: string }[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    let req = supabase
      .from('match_change_requests')
      .select('*, requester:profiles!requester_id(id,nickname)')
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter === 'pending') req = req.eq('status', 'pending');
    const { data } = await req;
    const list = (data as unknown as Req[]) ?? [];
    setRows(list);

    // 대상 경기 + 모임 제목 + 선수 닉네임 로드
    const matchIds = [...new Set(list.map((r) => r.match_id))];
    const meetupIds = [...new Set(list.map((r) => r.meetup_id))];
    if (matchIds.length > 0) {
      const [{ data: mm }, { data: mt }] = await Promise.all([
        supabase.from('meetup_matches').select('*').in('id', matchIds),
        supabase.from('meetups').select('id, title').in('id', meetupIds),
      ]);
      const mMap: Record<string, MeetupMatchRow> = {};
      ((mm as MeetupMatchRow[]) ?? []).forEach((m) => {
        mMap[m.id] = m;
      });
      setMatches(mMap);
      const tMap: Record<string, string> = {};
      ((mt as { id: string; title: string }[]) ?? []).forEach((t) => {
        tMap[t.id] = t.title;
      });
      setMeetupTitles(tMap);
      const playerIds = [
        ...new Set(
          ((mm as MeetupMatchRow[]) ?? []).flatMap((m) => [m.a1, m.a2, m.b1, m.b2]).filter(Boolean) as string[],
        ),
      ];
      if (playerIds.length > 0) {
        const { data: ps } = await supabase.from('profiles').select('id, nickname').in('id', playerIds);
        const nMap: Record<string, string> = {};
        ((ps as { id: string; nickname: string }[]) ?? []).forEach((p) => {
          nMap[p.id] = p.nickname;
        });
        setNicknames(nMap);
      }
    } else {
      setMatches({});
      setMeetupTitles({});
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  function teamLabel(m: MeetupMatchRow) {
    const name = (id: string | null) => (id ? nicknames[id] ?? '?' : null);
    const a = [name(m.a1), name(m.a2)].filter(Boolean).join('·');
    const b = [name(m.b1), name(m.b2)].filter(Boolean).join('·');
    return `${a} vs ${b}`;
  }

  async function markResolved(reqId: string, status: 'done' | 'rejected') {
    const { data: session } = await supabase.auth.getUser();
    await supabase
      .from('match_change_requests')
      .update({ status, resolved_by: session.user?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', reqId);
  }

  // 삭제 실행: DUPR match/delete → 로컬 행 삭제 → 요청 처리됨
  async function runDelete(r: Req) {
    const m = matches[r.match_id];
    if (!m) return;
    if (!confirm(`이 경기를 삭제할까요?\n${teamLabel(m)} · ${m.games.map((g) => `${g.a}-${g.b}`).join(', ')}\nDUPR에 등록된 경기면 DUPR에서도 제거됩니다.`)) return;
    setBusy(r.id);
    const { error: fnErr } = await supabase.functions.invoke('dupr-match', {
      body: { source: 'meetup', match_id: r.match_id, action: 'delete' },
    });
    if (fnErr) {
      setBusy(null);
      alert('DUPR 삭제 실패: ' + fnErr.message);
      return;
    }
    const { error } = await supabase.from('meetup_matches').delete().eq('id', r.match_id);
    if (error) {
      setBusy(null);
      alert('경기 행 삭제 실패: ' + error.message);
      return;
    }
    await markResolved(r.id, 'done');
    setBusy(null);
    alert('삭제 완료 — DUPR에서도 제거됐어요.');
    load();
  }

  // 수정 실행: 점수 저장 → DUPR 재제출(match/update 자동) → 요청 처리됨
  async function runEdit(r: Req) {
    const m = matches[r.match_id];
    const games = editGames[r.id];
    if (!m || !games) return;
    const gameRows = games
      .map((g) => ({ a: parseInt(g.a, 10), b: parseInt(g.b, 10) }))
      .filter((g) => Number.isFinite(g.a) && Number.isFinite(g.b));
    if (gameRows.length === 0) {
      alert('최소 한 게임의 점수를 입력하세요.');
      return;
    }
    setBusy(r.id);
    const { error } = await supabase.from('meetup_matches').update({ games: gameRows }).eq('id', r.match_id);
    if (error) {
      setBusy(null);
      alert('점수 저장 실패: ' + error.message);
      return;
    }
    const { error: fnErr } = await supabase.functions.invoke('dupr-match', {
      body: {
        source: 'meetup',
        match_id: r.match_id,
        format: m.format,
        teamA: { p1: m.a1, p2: m.a2 ?? undefined },
        teamB: { p1: m.b1, p2: m.b2 ?? undefined },
        games: gameRows,
      },
    });
    if (fnErr) {
      setBusy(null);
      alert('점수는 저장됐지만 DUPR 반영 실패: ' + fnErr.message);
      return;
    }
    await markResolved(r.id, 'done');
    setBusy(null);
    setEditGames((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
    alert('수정 완료 — DUPR에도 반영됐어요.');
    load();
  }

  async function reject(r: Req) {
    setBusy(r.id);
    await markResolved(r.id, 'rejected');
    setBusy(null);
    load();
  }

  if (role && role !== 'super_admin') {
    return <p className="mt-8 text-sm text-slate-500">운영자(super_admin)만 접근할 수 있어요.</p>;
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold">경기 수정·삭제 요청</h1>
      <p className="mt-1 text-sm text-slate-500">
        DUPR에 등록된 번개 경기는 호스트가 직접 고칠 수 없어요. 요청을 검토하고 실행하면 DUPR에 반영됩니다.
      </p>

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
          {rows.map((r) => {
            const m = matches[r.match_id];
            const editing = editGames[r.id];
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.kind === 'edit' ? 'bg-blue-100 text-blue-700' : 'bg-rose-100 text-rose-700'}`}>
                        {r.kind === 'edit' ? '수정 요청' : '삭제 요청'}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      <span className="font-medium text-slate-800">{meetupTitles[r.meetup_id] ?? '모임'}</span>
                    </div>
                    {m ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {m.format === 'doubles' ? '복식' : '단식'} · {teamLabel(m)} · {m.games.map((g) => `${g.a}-${g.b}`).join(', ')}
                        {m.dupr_status === 'submitted' ? <span className="ml-2 text-xs font-medium text-emerald-600">DUPR 등록됨</span> : null}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-slate-400">경기 정보를 찾을 수 없어요(이미 삭제됨).</p>
                    )}
                    {r.message ? <p className="mt-1 text-sm text-slate-600">요청 내용: {r.message}</p> : null}
                    <p className="mt-1 text-xs text-slate-400">
                      요청: {r.requester?.nickname ?? '알 수 없음'} · {new Date(r.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>

                  {r.status === 'pending' && m ? (
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {r.kind === 'delete' ? (
                        <button
                          onClick={() => runDelete(r)}
                          disabled={busy === r.id}
                          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                        >
                          삭제 실행
                        </button>
                      ) : editing ? (
                        <button
                          onClick={() => runEdit(r)}
                          disabled={busy === r.id}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          저장 + DUPR 반영
                        </button>
                      ) : (
                        <button
                          onClick={() => setEditGames((prev) => ({ ...prev, [r.id]: m.games.map((g) => ({ a: String(g.a), b: String(g.b) })) }))}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          점수 수정
                        </button>
                      )}
                      <button
                        onClick={() => reject(r)}
                        disabled={busy === r.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                      >
                        반려
                      </button>
                    </div>
                  ) : null}
                </div>

                {/* 수정 요청: 게임 점수 편집기 */}
                {r.status === 'pending' && r.kind === 'edit' && editing ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    {editing.map((g, i) => (
                      <div key={i} className="flex items-center gap-1 text-sm">
                        <span className="text-slate-500">{i + 1}게임</span>
                        <input
                          className="w-14 rounded border border-slate-300 px-2 py-1 text-center"
                          value={g.a}
                          onChange={(e) =>
                            setEditGames((prev) => ({
                              ...prev,
                              [r.id]: prev[r.id].map((row, idx) => (idx === i ? { ...row, a: e.target.value.replace(/[^0-9]/g, '') } : row)),
                            }))
                          }
                        />
                        <span>:</span>
                        <input
                          className="w-14 rounded border border-slate-300 px-2 py-1 text-center"
                          value={g.b}
                          onChange={(e) =>
                            setEditGames((prev) => ({
                              ...prev,
                              [r.id]: prev[r.id].map((row, idx) => (idx === i ? { ...row, b: e.target.value.replace(/[^0-9]/g, '') } : row)),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function MatchRequestsPage() {
  return (
    <Protected>
      <MatchRequestsInner />
    </Protected>
  );
}
