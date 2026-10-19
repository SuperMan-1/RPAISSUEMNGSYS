import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { NewPasswordForm } from "./NewPasswordForm";

export const metadata = { title: "새 비밀번호 설정 · RPA 이슈관리" };

/**
 * 임시비밀번호로 들어온 사람이 새 비밀번호를 정하는 화면.
 *
 * requireProfile() 이 이 화면으로 보내므로 여기서는 쓰지 않는다. 쓰면 서로를 부르며
 * 무한히 돈다. 세션과 플래그를 직접 확인한다.
 */
export default async function NewPasswordPage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, must_change_password")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/logout?reason=inactive");
  if (!profile.must_change_password) redirect("/");

  return (
    <main className="login-wrap">
      <div className="login-box">
        <h1>새 비밀번호 설정</h1>
        <p className="sub">{profile.name}님, 쓰실 비밀번호를 정해 주세요</p>

        <div className="flash flash-warn">
          임시비밀번호로 로그인하셨습니다. 새 비밀번호를 정해야 다른 화면을 쓸 수 있습니다.
        </div>

        <NewPasswordForm />
      </div>
    </main>
  );
}
