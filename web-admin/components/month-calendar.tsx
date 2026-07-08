'use client';

import { useState } from 'react';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

type Props = {
  /** 오픈된 날짜 집합(YYYY-MM-DD) */
  activeDays: Set<string>;
  /** 날짜 클릭 → 오픈/닫기 토글 */
  onToggle: (ymd: string) => void;
  /** 오늘(YYYY-MM-DD) — 과거는 비활성 */
  todayYmd: string;
  /** 초기 표시 월(YYYY-MM-DD). 기본 오늘 */
  initialMonth?: string;
};

export function MonthCalendar({ activeDays, onToggle, todayYmd, initialMonth }: Props) {
  const base = (initialMonth ?? todayYmd).split('-').map(Number);
  const [view, setView] = useState<{ y: number; m: number }>({ y: base[0], m: base[1] - 1 });

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const shift = (delta: number) => {
    const m = view.m + delta;
    const y = view.y + Math.floor(m / 12);
    setView({ y, m: ((m % 12) + 12) % 12 });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">
          ‹
        </button>
        <span className="text-sm font-semibold text-slate-800">
          {view.y}년 {view.m + 1}월
        </span>
        <button type="button" onClick={() => shift(1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-slate-400">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : ''}>
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, idx) => {
          if (d == null) return <div key={`b${idx}`} />;
          const key = toYmd(view.y, view.m, d);
          const past = key < todayYmd;
          const open = activeDays.has(key);
          return (
            <button
              key={key}
              type="button"
              disabled={past}
              onClick={() => onToggle(key)}
              className={`aspect-square rounded-lg text-sm transition ${
                past
                  ? 'cursor-not-allowed text-slate-300'
                  : open
                    ? 'bg-emerald-500 font-semibold text-white hover:bg-emerald-600'
                    : 'text-slate-700 hover:bg-emerald-50'
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">날짜를 클릭해 영업일을 열고 닫아요. 초록색이 오픈된 날입니다.</p>
    </div>
  );
}
