/**
 * Supabase 환경변수 읽기.
 *
 * 값이 없으면 "어느 파일에 무엇을 채워야 하는지"까지 알려주고 멈춘다.
 * 빌드 시점이 아니라 실제로 쓰이는 순간에 검사하므로, 키 없이도 빌드는 통과한다.
 */

export function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL 이 없습니다. .env.example 을 .env.local 로 복사하고 값을 채우세요.",
    );
  }
  return url;
}

export function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없습니다. .env.example 을 .env.local 로 복사하고 값을 채우세요.",
    );
  }
  return key;
}

export function getSupabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY 가 없습니다. 관리자 기능에만 필요하며 서버에서만 사용합니다.",
    );
  }
  return key;
}

/** 키가 설정돼 있는지만 확인 (설정 안내 화면 표시용) */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
