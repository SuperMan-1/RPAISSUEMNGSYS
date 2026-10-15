/** 서버 컴포넌트 / 서버 액션 / 라우트 핸들러용 Supabase 클라이언트 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/database.types";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다.
          // 세션 갱신은 middleware 가 담당하므로 여기서는 무시해도 된다.
        }
      },
    },
  });
}

/**
 * RLS 를 무시하는 관리자용 클라이언트.
 * 사용자 계정 생성처럼 꼭 필요한 곳에서만, 서버에서만 쓴다.
 */
export function createAdminClient() {
  return createServerClient<Database>(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // 관리자 클라이언트는 세션을 쓰지 않는다
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
