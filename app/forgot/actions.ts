"use server";

import { headers } from "next/headers";

import { emailKey, normalizeEmail, normalizeUsername, validateEmail } from "@/lib/account";
import { isMailConfigured, sendMail, temporaryPasswordMail } from "@/lib/mail";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/server";
import {
  generateTemporaryPassword,
  isReissueTooSoon,
  TEMP_PASSWORD_HOURS,
  TEMP_PASSWORD_REISSUE_MINUTES,
} from "@/lib/temp-password";

export type ForgotState = { error: string | null; ok: string | null };

/**
 * 아이디·이메일이 맞지 않아도 같은 문구를 돌려준다.
 * 어떤 아이디가 있는지 밖에서 떠볼 수 없게 하기 위해서다.
 */
const SENT = "입력하신 이메일로 임시비밀번호를 보냈습니다. 메일함을 확인하세요.";

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** 메일에 넣을 로그인 주소 */
async function loginUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return `${configured.replace(/\/+$/, "")}/login`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/login`;
}

export async function requestTemporaryPassword(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  if (!hasSupabaseSecretKey() || !isMailConfigured()) {
    return {
      error:
        "서버에 메일 설정이 없어 임시비밀번호를 보낼 수 없습니다. 관리자에게 문의하세요.",
      ok: null,
    };
  }

  const username = normalizeUsername(str(formData, "username"));
  const email = normalizeEmail(str(formData, "email"));

  if (!username) return { error: "아이디를 입력하세요.", ok: null };
  const badEmail = validateEmail(email);
  if (badEmail) return { error: badEmail, ok: null };

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, name, email, email_norm, is_active, password_reset_at")
    .eq("username", username)
    .maybeSingle();

  // 아이디와 이메일이 둘 다 맞아야 한다. 하나만 아는 사람에게는 아무것도 주지 않는다
  if (
    !profile ||
    !profile.is_active ||
    !profile.email ||
    profile.email_norm !== emailKey(email)
  ) {
    return { error: null, ok: SENT };
  }

  if (isReissueTooSoon(profile.password_reset_at)) {
    return {
      error: `조금 전에 임시비밀번호를 보냈습니다. ${TEMP_PASSWORD_REISSUE_MINUTES}분 뒤에 다시 시도하세요.`,
      ok: null,
    };
  }

  const password = generateTemporaryPassword();

  // 메일을 먼저 보낸다. 비밀번호부터 바꿔 놓고 메일이 실패하면
  // 본인도 모르는 사이에 로그인할 수 없게 된다.
  const sent = await sendMail(
    temporaryPasswordMail({
      to: profile.email,
      name: profile.name,
      username,
      password,
      hours: TEMP_PASSWORD_HOURS,
      loginUrl: await loginUrl(),
    }),
  );

  if (!sent.ok) {
    return {
      error: "메일을 보내지 못했습니다. 잠시 후 다시 시도하거나 관리자에게 문의하세요.",
      ok: null,
    };
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profile.id, { password });

  if (authError) {
    return {
      error: "임시비밀번호를 적용하지 못했습니다. 다시 시도하세요.",
      ok: null,
    };
  }

  await admin
    .from("profiles")
    .update({ must_change_password: true, password_reset_at: new Date().toISOString() })
    .eq("id", profile.id);

  return { error: null, ok: SENT };
}
