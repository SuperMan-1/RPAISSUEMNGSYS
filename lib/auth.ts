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
  if (!profile) redirect("/login");
  return profile;
}

/** 관리자만 쓸 수 있는 화면에서 쓴다. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "ADMIN") redirect("/");
  return profile;
}
