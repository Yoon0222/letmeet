'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { supabase } from './supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
