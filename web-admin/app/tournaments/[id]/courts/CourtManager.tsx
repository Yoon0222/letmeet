'use client';

import { useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { TournamentCourt } from '@/lib/types';

// 대회 코트 추가/삭제 — 생성 후에도 코트를 구성할 수 있게 한다.
// 코트가 0개면(닭-달걀) 이 폼이 유일한 진입점이므로 항상 노출.
export function CourtManager({
  tournamentId,
  courts,
  canEdit,
  reload,
}: {
  tournamentId: string;
  courts: TournamentCourt[];
  canEdit: boolean;
  reload: () => void;
}) {
  const [open, setOpen] = useState(courts.length === 0); // 코트 없으면 펼친 상태로
  const [numCount, setNumCount] = useState(4);
  const [manualName, setManualName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!canEdit) return null;

  async function addCourts(names: string[]) {
    const existing = new Set(courts.map((c) => c.name));
    const fresh = names.map((n) => n.trim()).filter((n) => n && !existing.has(n));
    if (fresh.length === 0) return;
    setBusy(true);
    setError('');
    const base = courts.length;
    const { error: err } = await supabase.from('tournament_courts').insert(
      fresh.map((name, i) => ({ tournament_id: tournamentId, name, indoor: true, sort: base + i })),
    );
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    reload();
  }

  async function toggleIndoor(c: TournamentCourt) {
    await supabase.from('tournament_courts').update({ indoor: !c.indoor }).eq('id', c.id);
    reload();
  }

  async function removeCourt(c: TournamentCourt) {
    if (!confirm(`'${c.name}' 코트를 삭제할까요? (배정된 경기가 있으면 해제됩니다)`)) return;
    // 이 코트에 배정된 경기부터 해제 → 코트 삭제
    await supabase.from('tournament_matches').update({ court_id: null, court_confirmed: false }).eq('court_id', c.id);
    await supabase.from('tournament_courts').delete().eq('id', c.id);
    reload();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium text-slate-700"
      >
        <span>코트 관리 · 현재 {courts.length}면</span>
        <span className="text-slate-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* 추가 */}
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <span className="mb-1 block text-xs text-slate-500">번호 코트</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={numCount}
                  onChange={(e) => setNumCount(Number(e.target.value))}
                  className="w-16 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    addCourts(Array.from({ length: Math.max(1, Math.min(50, numCount)) }, (_, i) => String(courts.length + i + 1)))
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                >
                  {numCount}면 추가
                </button>
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs text-slate-500">직접 입력</span>
              <div className="flex items-center gap-1">
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="예: 센터코트"
                  className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !manualName.trim()}
                  onClick={() => {
                    addCourts([manualName]);
                    setManualName('');
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>
          </div>

          {/* 목록 */}
          {courts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {courts.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm">
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <button type="button" onClick={() => toggleIndoor(c)} className={`rounded px-1.5 py-0.5 text-xs ${c.indoor ? 'bg-slate-100 text-slate-600' : 'bg-sky-100 text-sky-700'}`}>
                    {c.indoor ? '실내' : '실외'}
                  </button>
                  <button type="button" onClick={() => removeCourt(c)} className="text-slate-400 hover:text-rose-500" aria-label="삭제">
                    ✕
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-amber-600">아직 코트가 없어요. 위에서 코트를 추가하면 아래에서 경기별로 배정할 수 있어요.</p>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
