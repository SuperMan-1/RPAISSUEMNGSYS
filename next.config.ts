import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /*
   * cacheComponents 는 끈다.
   *
   * 이 앱은 모든 화면이 로그인한 사용자의 세션으로 DB를 읽는 동적 화면이다.
   * Cache Components 모드에서는 그런 접근마다 Suspense 경계를 요구해서,
   * 얻는 것 없이 화면마다 군더더기만 늘어난다.
   */
  cacheComponents: false,
};

export default nextConfig;
