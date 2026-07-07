'use client';

import { useState } from 'react';

import type { TournamentCourt, TournamentMatch } from '@/lib/types';

// 조별리그·본선 공용 경기 행 (점수 입력 + 차례 알림 + 코트 배정)
export function MatchRow({
  m,
  name,
  isOrganizer,
  courts = [],
  onSave,
  onNotify,
  onAssignCourt,
}: {
  m: TournamentMatch;
  name: (uid: string | null) => string;
  isOrganizer: boolean;
  courts?: TournamentCourt[];
  onSave: (m: TournamentMatch, s1: number, s2: number) => void;
  onNotify: (m: TournamentMatch) => void;
  onAssignCourt?: (m: TournamentMatch, courtId: string | null) => void;
}) {
  const [s1, setS1] = useState<string>(m.score1?.toString() ?? '');
  const [s2, setS2] = useState<string>(m.score2?.toString() ?? '');
  const done = m.status === 'done';
  const bothPresent = !!m.entry1_id && !!m.entry2_id; // 양쪽 팀 확정
  const isBye = done && !bothPresent; // 부전승(자동 확정)
  const court = courts.find((c) => c.id === m.court_id) ?? null;
  // 빈 슬롯 표시: 확정 부전승은 '부전승', 아직 안 정해진 다음 라운드는 '미정'
  const label = (id: string | null) => (id ? name(id) : done ? '부전승' : '미정');

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className={`flex-1 ${!m.entry1_id ? 'text-slate-400' : done && m.winner_id === m.entry1_id ? 'font-semibold text-emerald-700' : ''}`}>
          {label(m.entry1_id)}
        </span>
        {isBye ? (
          <span className="text-xs text-slate-400">부전승</span>
        ) : !bothPresent ? (
          <span className="text-xs text-slate-400">대기</span>
        ) : done && !isOrganizer ? (
          <span className="tabular-nums">{m.score1} : {m.score2}</span>
        ) : isOrganizer ? (
          <div className="flex items-center gap-1">
            <input value={s1} onChange={(e) => setS1(e.target.value)} inputMode="numeric" className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center" />
            <span className="text-slate-400">:</span>
            <input value={s2} onChange={(e) => setS2(e.target.value)} inputMode="numeric" className="w-12 rounded border border-slate-300 px-1.5 py-1 text-center" />
            <button
              onClick={() => onSave(m, Number(s1), Number(s2))}
              disabled={s1 === '' || s2 === ''}
              className="ml-1 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700 disabled:opacity-40"
            >
              저장
            </button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">예정</span>
        )}
        <span className={`flex-1 text-right ${!m.entry2_id ? 'text-slate-400' : done && m.winner_id === m.entry2_id ? 'font-semibold text-emerald-700' : ''}`}>
          {label(m.entry2_id)}
        </span>
        {isOrganizer && !done && bothPresent && (
          <button
            onClick={() => onNotify(m)}
            title="이 경기 선수들에게 차례 알림 보내기"
            className="ml-1 whitespace-nowrap rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
          >
            🔔 차례 알림
          </button>
        )}
      </div>

      {/* 코트 배정 (양팀 확정 + 미완료일 때) */}
      {courts.length > 0 && bothPresent && !done && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-xs text-slate-400">🏟 코트</span>
          {isOrganizer && !done && onAssignCourt ? (
            <select
              value={m.court_id ?? ''}
              onChange={(e) => onAssignCourt(m, e.target.value || null)}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs outline-none focus:border-emerald-500"
            >
              <option value="">미정</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.indoor ? '실내' : '실외'})
                </option>
              ))}
            </select>
          ) : court ? (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200">
              {court.name} · {court.indoor ? '실내' : '실외'}
            </span>
          ) : (
            <span className="text-xs text-slate-400">미정</span>
          )}
        </div>
      )}
    </div>
  );
}
