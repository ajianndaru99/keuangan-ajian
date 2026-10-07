// ==============================================================================
// SUPABASE MIDDLEWARE HELPER: src/lib/supabase/middleware.ts
// Mengelola refresh session auth dan proteksi rute dashboard
// ==============================================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Jika env belum diset (misal dalam mode preview tanpa DB), izinkan lewat agar tidak crash
  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Ambil user yang sedang aktif
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginPage = request.nextUrl.pathname.startsWith('/login');
  const isStaticOrApi = 
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api') ||
    request.nextUrl.pathname.includes('.');

  if (!isStaticOrApi) {
    // 1. Jika belum login dan mengakses halaman yang diproteksi -> redirect ke /login
    if (!user && !isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    // 2. Jika sudah login dan mengakses /login -> redirect ke /inbox
    if (user && isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = '/inbox';
      return NextResponse.redirect(url);
    }

    // 3. Jika mengakses root path '/' -> arahkan ke '/inbox'
    if (request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = user ? '/inbox' : '/login';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
