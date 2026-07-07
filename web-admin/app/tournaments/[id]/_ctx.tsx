'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import type {
  TournamentCourt,
  TournamentEntryWithProfile,
  TournamentMatch,
  TournamentWithCounts,
} from '@/lib/types';

type Ctx = {
  t: TournamentWithCounts | null;
  entries: TournamentEntryWithProfile[];
  matches: TournamentMatch[];
  courts: TournamentCourt[];
  loading: boolean;
  reload: () => Promise<void>;
  // 선수/팀 이름 (복식이면 "닉 / 파트너")
  name: (uid: string | null) => string;
};

const TournamentContext = createContext<Ctx | null>(null);

export function useTournament(): Ctx {
  const c = useContext(TournamentContext);
  if (!c) throw new Error('useTournament는 TournamentProvider 안에서만 사용할 수 있어요.');
  return c;
}

export function TournamentProvider({ id, children }: { id: string; children: ReactNode }) {
  const [t, setT] = useState<TournamentWithCounts | null>(null);
  const [entries, setEntries] = useState<TournamentEntryWithProfile[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [courts, setCourts] = useState<TournamentCourt[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [{ data: tour }, { data: ents }, { data: ms }, { data: cs }] = await Promise.all([
      supabase.from('tournaments_with_counts').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tournament_entries')
        .select(
          '*, profiles:profiles!tournament_entries_user_id_fkey(id, nickname, skill_level, avatar_url, region), partner:profiles!tournament_entries_partner_id_fkey(id, nickname, skill_level, avatar_url, region)',
        )
        .eq('tournament_id', id)
        .order('created_at', { ascending: true }),
      supabase.from('tournament_matches').select('*').eq('tournament_id', id).order('slot', { ascending: true }),
      supabase.from('tournament_courts').select('*').eq('tournament_id', id).order('sort', { ascending: true }),
    ]);
    setT(tour ?? null);
    setEntries((ents as unknown as TournamentEntryWithProfile[]) ?? []);
    setMatches((ms as TournamentMatch[]) ?? []);
    setCourts((cs as TournamentCourt[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const name = (uid: string | null) => {
    if (!uid) return '부전승';
    const e = entries.find((x) => x.user_id === uid);
    const nick = e?.profiles?.nickname ?? '알 수 없음';
    const partnerNick = e?.partner?.nickname ?? e?.partner_name;
    return t?.discipline === 'doubles' && partnerNick ? `${nick} / ${partnerNick}` : nick;
  };

  return (
    <TournamentContext.Provider value={{ t, entries, matches, courts, loading, reload, name }}>
      {children}
    </TournamentContext.Provider>
  );
}
