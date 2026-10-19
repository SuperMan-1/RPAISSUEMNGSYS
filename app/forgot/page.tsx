import Link from "next/link";
import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth";
import { isMailConfigured } from "@/lib/mail";
import { hasSupabaseSecretKey, isSupabaseConfigured } from "@/lib/supabase/env";

import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "비밀번호 찾기 · RPA 이슈관리" };

export default async function ForgotPage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const profile = await getProfile();
  if (profile) redirect("/");

  const canSend = hasSupabaseSecretKey() && isMailConfigured();

  return (
    <main className="login-wrap">
      <div className="login-box">
        <h1>비밀번호 찾기</h1>
        <p className="sub">등록된 이메일로 임시비밀번호를 보내드립니다</p>

        {canSend ? (
          <ForgotForm />
        ) : (
          <>
            <div className="flash flash-warn">
              서버에 메일 설정이 없어 임시비밀번호를 보낼 수 없습니다. 관리자에게 비밀번호
              재설정을 요청하세요.
            </div>
            <p className="small dim" style={{ textAlign: "center", marginBottom: 0 }}>
              <Link href="/login">로그인으로 돌아가기</Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
