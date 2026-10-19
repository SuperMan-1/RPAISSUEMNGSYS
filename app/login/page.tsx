import { redirect } from "next/navigation";

import { getProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "로그인 · RPA 이슈관리" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!isSupabaseConfigured()) redirect("/setup");

  const profile = await getProfile();
  if (profile) redirect("/");

  const params = await searchParams;
  const raw = params.next;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const next = value && value.startsWith("/") && !value.startsWith("//") ? value : "/";

  // 가입 직후 / 사용 중지된 계정에서 돌아온 경우 안내를 띄운다
  const notice = params.signup
    ? "가입 신청이 접수되었습니다. 관리자가 승인하면 로그인할 수 있습니다."
    : params.inactive
      ? "사용이 중지된 계정입니다. 관리자에게 문의하세요."
      : undefined;

  return (
    <main className="login-wrap">
      <div className="login-box">
        <h1>RPA 이슈관리</h1>
        <p className="sub">사내 RPA 유지보수 이슈 통합관리</p>
        <LoginForm next={next} notice={notice} />
      </div>
    </main>
  );
}
