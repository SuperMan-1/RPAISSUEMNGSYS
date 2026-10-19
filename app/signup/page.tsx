import Link from "next/link";
import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth";
import { hasSupabaseSecretKey, isSupabaseConfigured } from "@/lib/supabase/env";

import { SignupForm } from "./SignupForm";

export const metadata = { title: "회원가입 · RPA 이슈관리" };

export default async function SignupPage() {
  if (!isSupabaseConfigured()) redirect("/setup");

  const profile = await getProfile();
  if (profile) redirect("/");

  return (
    <main className="login-wrap">
      <div className="login-box wide">
        <h1>회원가입</h1>
        <p className="sub">RPA 이슈관리 사용 신청</p>

        {hasSupabaseSecretKey() ? (
          <SignupForm />
        ) : (
          <>
            <div className="flash flash-warn">
              서버에 <code>SUPABASE_SECRET_KEY</code> 가 설정되지 않아 가입을 받을 수 없습니다.
              관리자에게 계정 발급을 요청하세요.
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
