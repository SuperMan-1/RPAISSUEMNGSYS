"use client";

import { ATTACHMENT_BUCKET, BLOCKED_EXTENSIONS, MAX_UPLOAD_MB } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export type UploadedFile = {
  path: string;
  name: string;
  type: string;
  size: number;
};

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

/**
 * 파일을 Supabase Storage 에 직접 올린다.
 *
 * 서버 액션을 거치지 않는 이유: Vercel 의 요청 본문 한도(4.5MB)에 걸려
 * 큰 첨부가 아예 올라가지 않는다. 브라우저에서 Storage 로 바로 보낸다.
 */
export async function uploadAttachments(files: File[]): Promise<UploadedFile[]> {
  const targets = files.filter((f) => f && f.size > 0);
  if (targets.length === 0) return [];

  const supabase = createClient();
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
  const uploaded: UploadedFile[] = [];

  for (const file of targets) {
    const ext = extensionOf(file.name);

    if (BLOCKED_EXTENSIONS.includes(ext)) {
      throw new Error(`첨부할 수 없는 형식입니다: ${file.name}`);
    }
    if (file.size > maxBytes) {
      throw new Error(`파일이 너무 큽니다 (최대 ${MAX_UPLOAD_MB}MB): ${file.name}`);
    }

    const path = `${crypto.randomUUID()}${ext}`;
    const { error } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, file, { contentType: file.type || "application/octet-stream" });

    if (error) {
      throw new Error(`첨부파일 업로드에 실패했습니다: ${file.name} (${error.message})`);
    }

    uploaded.push({
      path,
      name: file.name.slice(0, 255),
      type: file.type || "application/octet-stream",
      size: file.size,
    });
  }

  return uploaded;
}
