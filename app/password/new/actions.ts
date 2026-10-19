"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { validatePassword } from "@/lib/account";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export type NewPasswordState = { error: string | null };

export async function setNewPassword(
  _prev: NewPasswordState,
  formData: FormData,
): Promise<NewPasswordState> {
  const supabase = await createClient();

  // 화면에서만 막으면 안 된다. 서버 액션은 누구나 POST 할 수 있는 입구다
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/logout?reason=inactive");
  if (!profile.must_change_password) redirect("/");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("password_confirm") ?? "");

  const problem = validatePassword(password, confirm);
  if (problem) return { error: problem };

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    const message = error.message.includes("should be different")
      ? "임시비밀번호와 다른 비밀번호를 정하세요."
      : `비밀번호를 바꾸지 못했습니다. (${error.message})`;
    return { error: message };
  }

  // must_change_password 는 본인이 끌 수 없게 트리거로 막아 두었다.
  // 비밀번호를 실제로 바꾼 뒤 서버에서만 내린다.
  if (!hasSupabaseSecretKey()) {
    return {
      error:
        "비밀번호는 바뀌었지만 서버 설정 문제로 마무리하지 못했습니다. 관리자에게 문의하세요.",
    };
  }

  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: false, password_reset_at: null })
    .eq("id", user.id);

  if (flagError) {
    return { error: `비밀번호는 바뀌었지만 마무리하지 못했습니다. (${flagError.message})` };
  }

  // 임시비밀번호가 메일함에 평문으로 남아 있던 동안 남이 먼저 로그인했을 수 있다.
  // 지금 쓰는 세션만 남기고 나머지는 끊는다. 실패해도 비밀번호는 이미 바뀌었으므로
  // 여기서 멈추지는 않는다.
  await supabase.auth.signOut({ scope: "others" });

  revalidatePath("/", "layout");
  redirect("/");
}
