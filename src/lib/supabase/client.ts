// ==============================================================================
// SUPABASE BROWSER CLIENT: src/lib/supabase/client.ts
// Client Supabase untuk Client Component (hanya memakai ANON KEY)
// ==============================================================================

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
