'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { Protected } from '@/components/protected';
import { formatDateTime, skillRange, TOURNAMENT_STATUS_LABEL } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/use-session';
import type { TournamentStatus } from '@/lib/types';

import { TournamentProvider, useTournament } from './_ctx';

function Header() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { session } = useSession();
  const { t, reload } = useTournament();

  if (!t) return <p className="text-slate-500">불러오는 중…</p>;

  const isOrganizer = t.organizer_id === session?.user.id;
  const unit = t.discipline === 'doubles' ? '팀' : '명';
  const base = `/tournaments/${id}`;
  const tabs = [
    { href: base, label: '신청현황' },
    { href: `${base}/prelim`, label: '예선' },
    { href: `${base}/final`, label: '본선' },
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
