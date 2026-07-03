'use client';

import { useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { UserRole } from './types';
import { useSession } from './use-session';

export function useRole() {
  const { session, loading: sLoading } = useSession();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sLoading) return;
    const uid = session?.user.id;
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRole(null);
      setLoading(false);
      return;
    }
    let mounted = true;
    supabase
      .from('profiles')
      .select('role')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!mounted) return;
        setRole((data?.role as UserRole) ?? 'player');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [session, sLoading]);

  return { role, loading: sLoading || loading };
}
