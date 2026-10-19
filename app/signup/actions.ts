"use server";

import { redirect } from "next/navigation";

import {
  emailKey,
  normalizeEmail,
  normalizePhone,
  normalizeUsername,
  validateEmail,
  validatePassword,
  validatePhone,
  validateUsername,
} from "@/lib/account";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type SignupState = { error: string | null };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optional(formData: FormData, key: string, max: number): string | null {
  const v = str(formData, key);
  return v ? v.slice(0, max) : null;
}

/** 가입 화면의 아이디 중복 확인. 로그인 전에도 부를 수 있다 */
export async function checkUsername(
  raw: string,
): Promise<{ ok: boolean; message: string }> {
  const username = normalizeUsername(raw);

  const invalid = validateUsername(username);
  if (invalid) return { ok: false, message: invalid };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("username_taken", { p_username: username });

  if (error) return { ok: false, message: "중복 확인에 실패했습니다. 잠시 후 다시 시도하세요." };
  if (data) return { ok: false, message: "이미 쓰고 있는 아이디입니다." };
  return { ok: true, message: "사용할 수 있는 아이디입니다." };
}

export async function signUp(_prev: SignupState, formData: FormData): Promise<SignupState> {
  if (!hasSupabaseSecretKey()) {
    return {
      error:
        "서버에 SUPABASE_SECRET_KEY 가 없어 가입을 처리할 수 없습니다. 관리자에게 문의하세요.",
    };
  }

  // ---- 기본정보 ----
  const username = normalizeUsername(str(formData, "username"));
  const name = str(formData, "name");
  const email = normalizeEmail(str(formData, "email"));
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  // ---- 추가정보 ----
  const company = optional(formData, "company", 50);
  const dept = optional(formData, "dept", 50);
  const phone = normalizePhone(str(formData, "phone"));

  const problem =
    validateUsername(username) ??
    (!name ? "이름을 입력하세요." : null) ??
    (name.length > 50 ? "이름은 50자까지 쓸 수 있습니다." : null) ??
    validateEmail(email) ??
    validatePassword(password, passwordConfirm) ??
    validatePhone(phone);

  if (problem) return { error: problem };

  const admin = createAdminClient();

  // 아이디·이메일 중복은 DB 제약이 최종 판정을 하지만,
  // 계정을 만들기 전에 먼저 걸러야 쓸모없는 auth 계정이 남지 않는다.
  const [{ count: usernameTaken }, { count: emailTaken }] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("username", username),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("email_norm", emailKey(email)),
  ]);

  if (usernameTaken) return { error: "이미 쓰고 있는 아이디입니다." };
  if (emailTaken) {
    return { error: "이미 가입된 이메일입니다. 한 이메일로는 계정 하나만 만들 수 있습니다." };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // 인증메일은 보내지 않는다. 승인은 관리자가 한다
    user_metadata: { name, username, company, dept, phone },
  });

  if (createError || !created?.user) {
    const message = createError?.message ?? "";
    if (message.includes("already been registered") || message.includes("already exists")) {
      return { error: "이미 가입된 이메일입니다. 한 이메일로는 계정 하나만 만들 수 있습니다." };
    }
    return { error: `가입에 실패했습니다. (${message})` };
  }

  // 트리거가 프로필을 만들지만, 값이 확실히 들어가도록 한 번 더 맞춘다.
  // role 과 is_active 는 건드리지 않는다 — 승인 전까지 USER / 미사용이어야 한다.
  const { error: profileError } = await admin
    .from("profiles")
    .update({ username, name, email, company, dept, phone })
    .eq("id", created.user.id);

  if (profileError) {
    // 아이디가 방금 선점당한 경우 등. 반쪽짜리 계정을 남기지 않는다
    await admin.auth.admin.deleteUser(created.user.id);
    const duplicated = profileError.code === "23505";
    return {
      error: duplicated
        ? "방금 다른 사람이 같은 아이디나 이메일로 가입했습니다. 다시 시도하세요."
        : `가입에 실패했습니다. (${profileError.message})`,
    };
  }

  redirect("/login?signup=1");
}
