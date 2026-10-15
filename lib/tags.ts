import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

/** '로그인, 인증서 #타임아웃' → ['로그인', '인증서', '타임아웃'] */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const chunk of raw.split(/[,\n;]+/)) {
    for (const piece of chunk.split(/\s+/)) {
      const name = piece.trim().replace(/^#+/, "").trim();
      if (name && !out.includes(name)) out.push(name.slice(0, 40));
    }
  }
  return out.slice(0, 12);
}

/** 태그 이름 목록을 tags 테이블에 보장하고 id 목록을 돌려준다 */
export async function ensureTagIds(supabase: Client, names: string[]): Promise<number[]> {
  if (names.length === 0) return [];

  const { data: existing } = await supabase.from("tags").select("id, name").in("name", names);
  const found = new Map((existing ?? []).map((t) => [t.name, t.id]));

  const missing = names.filter((n) => !found.has(n));
  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ name })))
      .select("id, name");
    for (const t of created ?? []) found.set(t.name, t.id);

    // 동시에 같은 태그를 만들면 unique 충돌로 빠질 수 있으니 한 번 더 읽는다
    const stillMissing = missing.filter((n) => !found.has(n));
    if (stillMissing.length > 0) {
      const { data: refetched } = await supabase
        .from("tags")
        .select("id, name")
        .in("name", stillMissing);
      for (const t of refetched ?? []) found.set(t.name, t.id);
    }
  }

  return names.map((n) => found.get(n)).filter((id): id is number => typeof id === "number");
}

/** 이슈의 태그를 주어진 목록과 일치시킨다 */
export async function syncIssueTags(
  supabase: Client,
  issueId: number,
  names: string[],
): Promise<void> {
  const tagIds = await ensureTagIds(supabase, names);

  const { data: current } = await supabase
    .from("issue_tags")
    .select("tag_id")
    .eq("issue_id", issueId);

  const currentIds = new Set((current ?? []).map((r) => r.tag_id));
  const wanted = new Set(tagIds);

  const toAdd = tagIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !wanted.has(id));

  if (toAdd.length > 0) {
    await supabase.from("issue_tags").insert(toAdd.map((tag_id) => ({ issue_id: issueId, tag_id })));
  }
  if (toRemove.length > 0) {
    await supabase.from("issue_tags").delete().eq("issue_id", issueId).in("tag_id", toRemove);
  }
}

/** 유사이슈 검색용 토큰 추출 (DB의 public.tokenize 와 같은 규칙) */
const STOPWORDS = new Set([
  "오류", "에러", "발생", "문제", "현상", "관련", "확인", "요청", "안됨", "되지",
  "않음", "대한", "경우", "이슈", "증상", "내용", "바랍니다",
  "the", "and", "for", "with", "error", "issue",
]);

export function tokenize(...texts: (string | null | undefined)[]): string[] {
  const seen: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const raw of text.match(/[0-9A-Za-z가-힣_]+/g) ?? []) {
      const token = raw.toLowerCase();
      if (token.length < 2 || STOPWORDS.has(token) || seen.includes(token)) continue;
      seen.push(token);
    }
  }
  return seen.slice(0, 12);
}
