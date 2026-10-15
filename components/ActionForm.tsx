"use client";

import { useRef, useState, useTransition } from "react";

import { addAction } from "@/app/(main)/issues/actions";
import { ACTION_RESULTS, MAX_UPLOAD_MB } from "@/lib/constants";
import { uploadAttachments } from "@/lib/upload";

/**
 * 처리 이력 등록 폼.
 *
 * 내용 textarea 는 비제어로 둔다. 옆 패널의 "처리내용 가져오기" 버튼이
 * DOM 을 직접 건드려 값을 채우기 때문이다.
 */
export function ActionForm({
  issueId,
  defaultActedAt,
  canClose,
}: {
  issueId: number;
  defaultActedAt: string;
  canClose: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.delete("files");

    const files = Array.from(fileRef.current?.files ?? []);

    startTransition(async () => {
      try {
        if (files.length > 0) {
          const uploaded = await uploadAttachments(files);
          formData.set("attachments", JSON.stringify(uploaded));
        }

        const result = await addAction(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        form.reset();
      } catch (e) {
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "등록 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      <input type="hidden" name="issue_id" value={issueId} />

      {error && <div className="flash flash-error">{error}</div>}

      <div className="form-row">
        <label className="lbl" htmlFor="content">
          처리내용<span className="req">*</span>
        </label>
        <textarea
          id="content"
          name="content"
          rows={7}
          required
          placeholder="무엇을 어떻게 처리했는지 적어주세요. 아직 해결하지 못했다면 그 경과를 적고 결과를 '미해결'로 두면 됩니다."
        />
      </div>

      <div className="form-grid">
        <div>
          <label className="lbl" htmlFor="acted_at">
            처리일자
          </label>
          <input
            type="datetime-local"
            id="acted_at"
            name="acted_at"
            defaultValue={defaultActedAt}
          />
        </div>

        <div>
          <label className="lbl" htmlFor="result">
            처리 결과
          </label>
          <select id="result" name="result" defaultValue="RESOLVED">
            {Object.entries(ACTION_RESULTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="lbl" htmlFor="action_files">
            첨부파일
          </label>
          <input type="file" id="action_files" name="files" ref={fileRef} multiple />
          <div className="help">1개당 최대 {MAX_UPLOAD_MB}MB</div>
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "등록 중…" : "처리 이력 등록"}
        </button>
        {canClose && (
          <label className="checkline">
            <input type="checkbox" name="close_issue" value="1" />
            등록과 함께 이슈 종료
          </label>
        )}
      </div>
    </form>
  );
}
