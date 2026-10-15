/**
 * 첨부파일 메타데이터 처리 (서버 전용).
 *
 * 파일 자체는 브라우저가 Storage 로 직접 올린다 (lib/upload.ts).
 * 여기서는 그 결과로 넘어온 메타데이터를 검증하고 DB 에 기록한다.
 * 브라우저에서 이미 검사했더라도 서버에서 다시 본다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { BLOCKED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/constants";
import type { Database } from "@/lib/database.types";

export type UploadedFile = {
  path: string;
  name: string;
  type: string;
  size: number;
};

/** 한 번에 받을 수 있는 첨부 개수 */
const MAX_FILES = 20;

export function parseUploads(formData: FormData): UploadedFile[] {
  const raw = formData.get("attachments");
  if (typeof raw !== "string" || !raw.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  const out: UploadedFile[] = [];

  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { path, name, type, size } = item as Record<string, unknown>;
    if (typeof path !== "string" || typeof name !== "string") continue;
    if (path.includes("..") || path.startsWith("/")) continue;

    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (BLOCKED_EXTENSIONS.includes(ext)) continue;

    const bytes = typeof size === "number" && size >= 0 ? size : 0;
    if (bytes > maxBytes) continue;

    out.push({
      path,
      name: name.slice(0, 255),
      type: typeof type === "string" && type ? type : "application/octet-stream",
      size: bytes,
    });
  }

  return out.slice(0, MAX_FILES);
}

type Owner = { issue_id?: number; action_id?: number; run_id?: number };

export async function insertAttachments(
  supabase: SupabaseClient<Database>,
  uploads: UploadedFile[],
  owner: Owner,
  uploadedBy: string,
): Promise<void> {
  if (uploads.length === 0) return;

  await supabase.from("attachments").insert(
    uploads.map((u) => ({
      ...owner,
      file_name: u.name,
      storage_path: u.path,
      content_type: u.type,
      size: u.size,
      uploaded_by: uploadedBy,
    })),
  );
}
