import { cache } from "react";
import { redirect } from "next/navigation";

import type { Tables } from "@/lib/database.types";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export type Profile = Tables<"profiles"> & { email: string | null };

/**
 * 현재 로그인한 사용자의 프로필.
 * cache() 로 감싸서 한 요청 안에서 여러 번 불러도 쿼리는 한 번만 나간다.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!data || !data.is_active) return null;
  return { ...data, email: user.email ?? null };
});

/** 로그인이 필요한 화면에서 쓴다. 미로그인이면 /login 으로 보낸다. */
export async function requireProfile(): Promise<Profile> {
  if (!isSupabaseConfigured()) redirect("/setup");

  const profile = await getProfile();
  if (profile) {
    // 임시비밀번호로 들어온 사람은 새 비밀번호를 정하기 전까지 아무 화면도 열 수 없다.
    // 화면마다 검사하지 않도록 여기 한 곳에서 막는다.
    if (profile.must_change_password) redirect("/password/new");
    return profile;
  }

  // 세션은 살아 있는데 프로필이 없거나 '사용'이 꺼진 계정.
  // 바로 /login 으로 보내면 proxy 가 로그인된 사용자로 보고 되돌려 보내 무한 루프가 된다.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/logout?reason=inactive");

  redirect("/login");
}

/** 관리자만 쓸 수 있는 화면에서 쓴다. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/");
  return profile;
}
