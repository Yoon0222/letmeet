'use client';

import type { TieMatch, TournamentTie } from '@/lib/types';

// 단체전 본선 대진표(트리) — 라운드를 왼쪽→오른쪽 열로, 대결을 카드로 그린다(개인전 본선 대진표와 같은 모양).
//   부전승이 섞인 앞 라운드(예: 68팀 → 128칸의 128강)는 건너뛰고, 부전승이 없는 첫 라운드부터 그린다.
//   그 라운드에서 앞 라운드 승자를 기다리는 자리는 "A / B 승자"로 보여 준다. 카드를 누르면 그 라운드 목록(점수 입력)으로 간다.
const ROW_H = 104; // 첫 열 카드 한 칸의 높이
const CARD_H = 84;

export function TeamKnockoutTree({
  ties,
  subs,
  nameOf,
  courtName,
  onOpenRound,
  highlight,
  zoom = 1,
}: {
  ties: TournamentTie[]; // 본선 대결 전체
  subs: TieMatch[];
  nameOf: (teamId: string | null) => string;
  courtName: (courtId: string | null) => string | null;
  onOpenRound: (round: number) => void;
  highlight?: (tie: TournamentTie) => boolean;
  zoom?: number;
}) {
  const rounds = [...new Set(ties.map((x) => x.round_order ?? 1))].sort((a, b) => a - b);
  const inRound = (r: number) => ties.filter((x) => (x.round_order ?? 1) === r).sort((a, b) => a.slot - b.slot);
  const isBye = (x: TournamentTie) => x.status === 'done' && (!x.team1_id || !x.team2_id);
  const startIdx = Math.max(0, rounds.findIndex((r) => !inRound(r).some(isBye)));
  const shown = rounds.slice(startIdx);
  if (shown.length === 0) return null;
  const firstCount = inRound(shown[0]).length;

  // 빈 자리: 앞 라운드에서 이 자리로 올라올 대결(슬롯 2s, 2s+1 — 인접한 두 대결의 승자가 만난다)
  const waitingLabel = (tie: TournamentTie, side: 1 | 2) => {
    const r = tie.round_order ?? 1;
    const prev = ties.find((x) => (x.round_order ?? 1) === r - 1 && x.slot === tie.slot * 2 + (side - 1));
    if (!prev) return '미정';
    if (prev.team1_id && prev.team2_id) return `${nameOf(prev.team1_id)} / ${nameOf(prev.team2_id)} 승자`;
    return '앞 경기 승자';
  };
  const winsOf = (tieId: string) => {
    const s = subs.filter((m) => m.tie_id === tieId);
    return [s.filter((m) => m.winner === 'team1').length, s.filter((m) => m.winner === 'team2').length];
  };

  return (
    <div className="max-h-[72vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50/70">
      <div className="flex min-w-max gap-10 p-4" style={{ zoom }}>
        {shown.map((r, k) => {
          const list = inRound(r);
          const step = 2 ** k;
          const height = Math.max(firstCount * ROW_H, ROW_H);
          return (
            <section key={r} className="w-60 shrink-0">
              <div className="sticky top-0 z-10 mb-3 flex h-9 items-center justify-between border-b border-slate-200 bg-slate-50 px-1">
                <h3 className="font-semibold text-slate-900">{list[0]?.round_name ?? `${r}라운드`}</h3>
                <span className="text-xs text-slate-400">{list.filter((x) => !isBye(x)).length}경기</span>
              </div>
              <div className="relative" style={{ height: `${height}px` }}>
                {list.map((tie) => {
                  const center = (tie.slot * step + step / 2) * ROW_H;
                  const half = (step * ROW_H) / 4;
                  const [w1, w2] = winsOf(tie.id);
                  const done = tie.status === 'done';
                  const live = !done && (!!tie.court_id || w1 + w2 > 0);
                  const court = courtName(tie.court_id);
                  const side = (teamId: string | null, wins: number, idx: 1 | 2) => {
                    const won = done && !!teamId && tie.winner_team_id === teamId;
                    return (
                      <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 ${idx === 2 ? 'border-t border-slate-100' : ''}`}>
                        <span className={`truncate text-sm ${teamId ? (won ? 'font-semibold text-emerald-700' : 'text-slate-800') : 'text-xs text-slate-400'}`}>
                          {teamId ? nameOf(teamId) : isBye(tie) ? '부전승' : waitingLabel(tie, idx)}
                        </span>
                        {teamId && (done || live) ? <span className={`text-sm tabular-nums ${won ? 'font-semibold text-emerald-700' : 'text-slate-500'}`}>{wins}</span> : null}
                      </div>
                    );
                  };
                  return (
                    <div key={tie.id} className="absolute left-0" style={{ top: `${center - CARD_H / 2}px` }}>
                      {k > 0 ? (
                        <>
                          <span className="pointer-events-none absolute right-full top-1/2 w-5 border-t border-slate-300" />
                          <span
                            className="pointer-events-none absolute right-[calc(100%+20px)] border-l border-slate-300"
                            style={{ top: `calc(50% - ${half}px)`, height: `${half * 2}px` }}
                          />
                        </>
                      ) : null}
                      {k < shown.length - 1 ? <span className="pointer-events-none absolute left-full top-1/2 w-5 border-t border-slate-300" /> : null}
                      <button
                        onClick={() => onOpenRound(r)}
                        title="이 라운드 목록에서 점수 입력"
                        className={`block w-56 overflow-hidden rounded-lg border bg-white text-left shadow-sm transition hover:shadow ${
                          highlight?.(tie) ? 'ring-2 ring-sky-400' : ''
                        } ${done ? 'border-emerald-300' : live ? 'border-amber-300' : 'border-slate-200'}`}
                        style={{ minHeight: `${CARD_H - 10}px` }}>
                        {side(tie.team1_id, w1, 1)}
                        {side(tie.team2_id, w2, 2)}
                        {court ? <div className="border-t border-slate-100 px-2.5 py-0.5 text-[11px] text-slate-500">🏟 {court}</div> : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
