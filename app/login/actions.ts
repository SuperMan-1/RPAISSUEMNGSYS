"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { normalizeUsername } from "@/lib/account";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

/** 외부 사이트로 튕기지 않도록 내부 경로만 허용 */
function safeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

/**
 * 아이디로 이메일을 찾는다.
 *
 * Supabase Auth 는 이메일로만 로그인하므로 한 번 바꿔줘야 한다.
 * 이 조회는 서버에서 secret 키로만 하고, 찾은 이메일은 밖으로 내보내지 않는다.
 */
async function emailForUsername(username: string): Promise<string | null> {
  if (!hasSupabaseSecretKey()) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .maybeSingle();

  return data?.email ?? null;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const input = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!input || !password) {
    return { error: "아이디와 비밀번호를 입력하세요." };
  }

  // 아이디로 로그인한다. 이메일을 그대로 넣어도 받아주면
  // secret 키가 없는 환경에서도 관리자가 들어올 수 있다.
  const email = input.includes("@")
    ? input.toLowerCase()
    : await emailForUsername(normalizeUsername(input));

  if (!email) {
    return hasSupabaseSecretKey()
      ? { error: "아이디 또는 비밀번호가 올바르지 않습니다." }
      : {
          error:
            "서버에 SUPABASE_SECRET_KEY 가 없어 아이디로 로그인할 수 없습니다. 이메일로 로그인하세요.",
        };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase 원문 메시지는 영어라 그대로 보여주지 않는다
    const message =
      error.message === "Invalid login credentials"
        ? "아이디 또는 비밀번호가 올바르지 않습니다."
        : error.message === "Email not confirmed"
          ? "이메일 인증이 완료되지 않은 계정입니다. 관리자에게 문의하세요."
          : `로그인에 실패했습니다. (${error.message})`;
    return { error: message };
  }

  // 승인 전(is_active = false)인 계정은 프로필이 RLS 에 걸려 한 줄도 보이지 않는다.
  // 비밀번호를 맞힌 뒤에 검사해야 계정 상태가 남에게 새지 않는다.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return {
      error: "아직 승인되지 않은 계정입니다. 관리자가 승인하면 로그인할 수 있습니다.",
    };
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
