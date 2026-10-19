import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * 로그아웃하고 로그인 화면으로 돌려보낸다.
 *
 * 화면(서버 컴포넌트)에서는 쿠키를 지울 수 없어서 라우트 핸들러로 둔다.
 * 세션은 살아 있는데 계정이 중지된 경우, 그냥 /login 으로 보내면
 * proxy 가 "로그인된 사용자" 로 보고 되돌려 보내 무한 루프가 된다.
 * 먼저 세션을 끊어야 로그인 화면에 머무를 수 있다.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = request.nextUrl.searchParams.get("reason") === "inactive" ? "?inactive=1" : "";
  return NextResponse.redirect(url);
}
