/**
 * Supabase 환경변수 읽기.
 *
 * 키 이름이 두 가지인 이유
 *   Supabase 가 anon / service_role 키를 publishable / secret 키로 바꾸고 있다.
 *   새 프로젝트는 sb_publishable_... / sb_secret_... 를 받는다.
 *   코드에서 쓰는 방법은 똑같고 문자열만 다르다.
 *   새 이름을 먼저 보고, 없으면 예전 이름을 본다. 둘 중 아무거나 쓰면 된다.
 *
 * 값이 없으면 "어느 파일에 무엇을 채워야 하는지"까지 알려주고 멈춘다.
 * 빌드 시점이 아니라 실제로 쓰이는 순간에 검사하므로, 키 없이도 빌드는 통과한다.
 */

// NEXT_PUBLIC_ 변수는 빌드 때 치환되므로 반드시 통째로 적어야 한다.
// (process.env[변수이름] 처럼 동적으로 읽으면 브라우저에서 값이 비어 버린다)
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

export function getSupabaseUrl(): string {
  if (!SUPABASE_URL) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 이 없습니다. .env.example 을 .env.local 로 복사하고 값을 채우세요.",
    );
  }
  return SUPABASE_URL;
}

/** 브라우저에 나가도 되는 키 (publishable 또는 예전 anon) */
export function getSupabasePublishableKey(): string {
  if (!PUBLISHABLE_KEY) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없습니다. .env.example 을 .env.local 로 복사하고 값을 채우세요.",
    );
  }
  return PUBLISHABLE_KEY;
}

/** 서버 전용 키 (secret 또는 예전 service_role). 없으면 null */
export function getSupabaseSecretKeyOrNull(): string | null {
  return process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
}

export function getSupabaseSecretKey(): string {
  const key = getSupabaseSecretKeyOrNull();
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY 가 없습니다. 계정 생성 같은 관리자 기능에만 필요하며 서버에서만 사용합니다.",
    );
  }
  return key;
}

/** 계정 생성·비밀번호 재설정을 쓸 수 있는지 (서버에서만 호출할 것) */
export function hasSupabaseSecretKey(): boolean {
  return Boolean(getSupabaseSecretKeyOrNull());
}

/** 키가 설정돼 있는지만 확인 (설정 안내 화면 표시용) */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && PUBLISHABLE_KEY);
}
