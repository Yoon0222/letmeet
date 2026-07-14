'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Protected } from '@/components/protected';
import { formatDateTime, skillRange, TOURNAMENT_STATUS_LABEL } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import { TOURNAMENT_FORMAT_LABELS, type TournamentStatus } from '@/lib/types';

import { TournamentProvider, useTournament } from './_ctx';

function Header() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { session } = useSession();
  const { t, courts, reload, query, setQuery } = useTournament();

  if (!t) return <p className="text-slate-500">불러오는 중…</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const unit = t.discipline === 'doubles' ? '팀' : '명';
  const base = `/tournaments/${id}`;
  // 진행 방식별 탭: KDK=순위전(본선 없음), 단체전=신청현황만(엔진 준비중), 그 외=예선+본선
  const progressTabs =
    t.format === 'kdk'
      ? [{ href: `${base}/prelim`, label: '순위전' }]
      : t.format === 'team'
        ? []
        : [
            { href: `${base}/prelim`, label: '예선' },
            { href: `${base}/final`, label: '본선' },
          ];
  const tabs = [
    { href: base, label: '신청현황' },
    ...progressTabs,
    ...(courts.length > 0 ? [{ href: `${base}/courts`, label: '코트배정' }] : []),
  ];

  async function endTournament() {
    await supabase.from('tournaments').update({ status: 'finished' as TournamentStatus }).eq('id', id);
    reload();
  }

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm text-slate-500">{TOURNAMENT_STATUS_LABEL[t.status]}</span>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <span className="mr-1.5 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{TOURNAMENT_FORMAT_LABELS[t.format]}</span>
            {t.discipline === 'doubles' ? '복식' : '단식'} · {formatDateTime(t.start_at)} · {t.venue || '장소 미정'}
            {t.region ? ` · ${t.region}` : ''} · 정원 {t.approved_count}/{t.max_participants}{unit}
            {' · '}실력 {skillRange(t.skill_min, t.skill_max)}
          </p>
        </div>
        {isOrganizer && t.status !== 'cancelled' && t.status !== 'finished' && (
          <button onClick={endTournament} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">
            대회 종료
          </button>
        )}
      </div>

      <nav className="mt-6 flex gap-1 border-b border-slate-200">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`-mb-px border-b-2 px-5 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* 이름 검색 (탭 공용) */}
      <div className="relative mt-3 max-w-sm">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름으로 검색 (참가자·경기)"
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-8 text-sm outline-none focus:border-emerald-500"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            title="지우기"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export default function TournamentLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <Protected>
      <TournamentProvider id={id}>
        <Header />
        <div className="mt-6">{children}</div>
      </TournamentProvider>
    </Protected>
  );
}
