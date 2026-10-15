'use client';

import { useCallback, useEffect, useState } from 'react';

import { Avatar } from '@/components/avatar';
import { supabase } from '@/lib/supabase';
import type { TournamentTeamWithMembers } from '@/lib/types';

// 단체전 신청현황 — 신청 팀 목록 + 주최자 승인/거절.
//   팀마다 소속 클럽과 용병(클럽 밖 회원)을 보여 주고, 운영자는 팀 이름을 고치거나 클럽 이름으로 되돌릴 수 있다(0101).
export function TeamRoster({ tournamentId, isOrganizer }: { tournamentId: string; isOrganizer: boolean }) {
  const [teams, setTeams] = useState<TournamentTeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('tournament_teams')
      .select('*, club:clubs(id, name), members:tournament_team_members(user_id, is_guest, profiles(id, nickname, skill_level, avatar_url, region))')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true });
    setTeams((data as unknown as TournamentTeamWithMembers[]) ?? []);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    // load 는 비동기로 await 이후 setState 를 호출한다 (동기 cascading 렌더 아님)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function setStatus(teamId: string, status: 'approved' | 'rejected') {
    await supabase.from('tournament_teams').update({ status }).eq('id', teamId);
    load();
  }

  // 팀 이름 수정 — 직접 입력하거나 클럽 이름으로 되돌린다
  async function rename(team: TournamentTeamWithMembers, next?: string) {
    const name = (next ?? prompt('팀 이름', team.name) ?? '').trim();
    if (!name || name === team.name) return;
    if (name.length > 20) return alert('팀 이름은 20자까지 쓸 수 있어요.');
    const { data, error } = await supabase.from('tournament_teams').update({ name }).eq('id', team.id).select('id');
    if (error) return alert(`이름을 바꾸지 못했어요: ${error.message}`);
    if (!data || data.length === 0) return alert('이 대회의 주최자만 팀 이름을 바꿀 수 있어요.');
    load();
  }

  if (loading) return <p className="text-slate-500">불러오는 중…</p>;

  const pending = teams.filter((t) => t.status === 'pending');
  const approved = teams.filter((t) => t.status === 'approved');

  const Card = ({ team, actions }: { team: TournamentTeamWithMembers; actions?: boolean }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{team.name}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {team.club ? `소속 클럽 ${team.club.name}` : '소속 클럽 없음(옛 앱으로 신청)'} · {team.members.length}명
            {team.members.some((m) => m.is_guest) ? ` · 용병 ${team.members.filter((m) => m.is_guest).length}명` : ''}
          </p>
          {isOrganizer && (
            <div className="mt-1 flex gap-3 text-xs">
              <button onClick={() => rename(team)} className="text-blue-600 hover:underline">
                이름 수정
              </button>
              {team.club && team.club.name !== team.name && (
                <button onClick={() => rename(team, team.club?.name)} className="text-blue-600 hover:underline">
                  클럽 이름으로
                </button>
              )}
            </div>
          )}
        </div>
        {actions && isOrganizer && (
          <div className="flex gap-2">
            <button onClick={() => setStatus(team.id, 'approved')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
              승인
            </button>
            <button onClick={() => setStatus(team.id, 'rejected')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
              거절
            </button>
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {team.members.map((m) => (
          <span key={m.user_id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 text-sm">
            <Avatar nickname={m.profiles?.nickname ?? '?'} url={m.profiles?.avatar_url ?? null} size={22} />
            <span className="text-slate-700">{m.profiles?.nickname ?? '알 수 없음'}</span>
            {m.user_id === team.captain_id && <span className="rounded-full bg-sky-100 px-1.5 text-xs font-medium text-sky-700">주장</span>}
            {m.is_guest && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-700">용병</span>}
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-lg font-medium">신청 팀 {pending.length}팀</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500">승인 대기 중인 팀이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((team) => (
              <Card key={team.id} team={team} actions />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">참가 확정 {approved.length}팀</h2>
        {approved.length === 0 ? (
          <p className="text-sm text-slate-500">아직 확정된 팀이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {approved.map((team) => (
              <Card key={team.id} team={team} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
