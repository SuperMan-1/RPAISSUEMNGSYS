import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/session";

/**
 * 요청마다 Supabase 세션을 갱신하고 로그인 여부를 검사한다.
 * (Next.js 16부터 middleware.ts 대신 proxy.ts 를 쓴다)
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // 정적 파일과 이미지 최적화 경로는 제외
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
