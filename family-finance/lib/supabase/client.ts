// lib/supabase/client.ts
'use client';

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Supabase переменные не найдены. Проверьте .env.local или Vercel → Environment Variables');
    // Для теста можно вернуть null или throw — но не падайте в проде
    return null;
  }

  return createBrowserClient(url, key);
}