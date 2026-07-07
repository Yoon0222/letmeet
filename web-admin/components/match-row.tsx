'use client';

import { useState } from 'react';

import type { TournamentMatch } from '@/lib/types';

// 조별리그·본선 공용 경기 행 (점수 입력 + 차례 알림)
export function MatchRow({
  m,
  name,
  isOrganizer,
  onSave,
  onNotify,
}: {
  m: TournamentMatch;
  name: (uid: string | null) => string;
  isOrganizer: boolean;
  onSave: (m: TournamentMatch, s1: number, s2: number) => void;
  onNotify: (m: TournamentMatch) => void;
}) {
  const [s1, setS1] = useState<string>(m.score1?.toString() ?? '');
  const [s2, setS2] = useState<string>(m.score2?.toString() ?? '');
  const done = m.status === 'done';
  const bye = !m.entry2_id;

  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className={`flex-1 ${done && m.winner_id === m.entry1_id ? 'font-semibold text-emerald-700' : ''}`}>
        {name(m.entry1_id)}
      </span>
      {bye ? (
        <span className="text-xs text-slate-400">부전승</span>
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
      <span className={`flex-1 text-right ${done && m.winner_id === m.entry2_id ? 'font-semibold text-emerald-700' : ''}`}>
        {name(m.entry2_id)}
      </span>
      {isOrganizer && !done && !bye && (
        <button
          onClick={() => onNotify(m)}
          title="이 경기 선수들에게 차례 알림 보내기"
          className="ml-1 whitespace-nowrap rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50"
        >
          🔔 차례 알림
        </button>
      )}
    </div>
  );
}
