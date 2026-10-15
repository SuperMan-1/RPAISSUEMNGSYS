"use client";

import { useRef, useState, useTransition } from "react";

import { addRunAttachments } from "@/app/(main)/inspections/actions";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { uploadAttachments } from "@/lib/upload";

/**
 * 점검 이력에 첨부파일을 올린다.
 *
 * 점검 결과 입력 폼과 따로 둔 이유: 결과 폼은 항목 저장이 목적이라,
 * 파일을 올리려고 결과까지 함께 제출하게 되면 실수로 덮어쓸 수 있다.
 */
export function RunAttachmentForm({ runId }: { runId: number }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const files = Array.from(fileRef.current?.files ?? []);

    if (files.length === 0) {
      setError("올릴 파일을 선택하세요.");
      return;
    }

    startTransition(async () => {
      try {
        const uploaded = await uploadAttachments(files);

        const formData = new FormData();
        formData.set("run_id", String(runId));
        formData.set("attachments", JSON.stringify(uploaded));

        const result = await addRunAttachments(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        form.reset();
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "업로드 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="flash flash-error">{error}</div>}

      <div className="form-row">
        <label className="lbl" htmlFor="run_files">
          파일 선택
        </label>
        <input type="file" id="run_files" ref={fileRef} multiple />
        <div className="help">
          점검 화면 캡처, 로그 파일 등 (1개당 최대 {MAX_UPLOAD_MB}MB)
        </div>
      </div>

      <div className="btn-row">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "올리는 중…" : "첨부파일 올리기"}
        </button>
      </div>
    </form>
  );
}
