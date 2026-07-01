import { createClient } from '@supabase/supabase-js';

import type { Database } from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && anon);

// 모바일 앱과 동일한 Supabase 프로젝트를 공유한다.
export const supabase = createClient<Database>(url || 'https://placeholder.supabase.co', anon || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true },
});
