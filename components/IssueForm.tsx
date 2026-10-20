"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { createIssue, searchSimilar, updateIssue } from "@/app/(main)/issues/actions";
import { SimilarList } from "@/components/SimilarList";
import { MAX_UPLOAD_MB, SEVERITIES } from "@/lib/constants";
import type { SimilarIssue } from "@/lib/database.types";
import { uploadAttachments } from "@/lib/upload";

export type IssueFormOption = { id: number; name: string };
export type TaskOption = { id: number; site_id: number; name: string };
export type UserOption = { id: string; name: string };

export type IssueDraft = {
  siteId: string;
  taskId: string;
  typeId: string;
  title: string;
  symptom: string;
  severity: string;
  tags: string;
  assigneeId: string;
  occurredAt: string;
};

export function IssueForm({
  mode,
  issueId,
  sites,
  tasks,
  types,
  users,
  draft,
  source,
}: {
  mode: "create" | "edit";
  issueId?: number;
  sites: IssueFormOption[];
  tasks: TaskOption[];
  types: IssueFormOption[];
  users: UserOption[];
  draft: IssueDraft;
  /** 정기점검의 이상 항목에서 전환해 들어온 경우 */
  source?: { runId: number; resultId: number; label: string };
}) {
  const [siteId, setSiteId] = useState(draft.siteId);
  const [taskId, setTaskId] = useState(draft.taskId);
  const [typeId, setTypeId] = useState(draft.typeId);
  const [title, setTitle] = useState(draft.title);
  const [symptom, setSymptom] = useState(draft.symptom);
  const [tags, setTags] = useState(draft.tags);

  const [hits, setHits] = useState<SimilarIssue[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fileRef = useRef<HTMLInputElement>(null);

  // 선택한 사이트의 과제만 보여준다
  const siteTasks = useMemo(
    () => tasks.filter((t) => String(t.site_id) === siteId),
    [tasks, siteId],
  );

  // 사이트를 바꾸면 과제 선택을 비운다 (effect 대신 이벤트에서 처리)
  function handleSiteChange(value: string) {
    setSiteId(value);
    setTaskId("");
  }

  // 입력이 멎으면 유사 이슈를 찾는다
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      const enough =
        title.trim().length >= 2 || symptom.trim().length >= 4 || tags.trim().length > 0;

      if (!enough) {
        if (!cancelled) setHits([]);
        return;
      }

      setSearching(true);
      try {
        const result = await searchSimilar({
          title,
          symptom: symptom.slice(0, 2000),
          tags,
          typeId: typeId ? Number(typeId) : null,
          siteId: siteId ? Number(siteId) : null,
          excludeIssueId: issueId ?? null,
        });
        if (!cancelled) setHits(result);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [title, symptom, tags, typeId, siteId, issueId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    formData.delete("files");

    const files = Array.from(fileRef.current?.files ?? []);

    startTransition(async () => {
      try {
        if (files.length > 0) {
          const uploaded = await uploadAttachments(files);
          formData.set("attachments", JSON.stringify(uploaded));
        }

        const result =
          mode === "edit" ? await updateIssue(formData) : await createIssue(formData);

        // 성공하면 액션이 리다이렉트하므로 여기로 돌아오지 않는다
        if (result?.error) setError(result.error);
      } catch (e) {
        // redirect() 는 예외로 전달되므로 그대로 흘려보낸다
        if (e && typeof e === "object" && "digest" in e) throw e;
        setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="split">
      <form onSubmit={handleSubmit}>
        {mode === "edit" && issueId && (
          <input type="hidden" name="issue_id" value={issueId} />
        )}

        {source && (
          <>
            <input type="hidden" name="source_run_id" value={source.runId} />
            <input type="hidden" name="from_result_id" value={source.resultId} />
            <div className="flash flash-warn">
              정기점검에서 전환하는 이슈입니다. 등록하면 점검 기록과 서로 연결됩니다.
              <div className="small" style={{ marginTop: 4 }}>
                {source.label}
              </div>
            </div>
          </>
        )}

        {error && <div className="flash flash-error">{error}</div>}

        <div className="card">
          <div className="card-head">
            <h2>발생 정보</h2>
          </div>
          <div className="card-body">
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="site_id">
                  사이트<span className="req">*</span>
                </label>
                <select
                  id="site_id"
                  name="site_id"
                  value={siteId}
                  onChange={(e) => handleSiteChange(e.target.value)}
                  required
                >
                  <option value="">선택하세요</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="task_id">
                  과제
                </label>
                <select
                  id="task_id"
                  name="task_id"
                  value={taskId}
                  onChange={(e) => setTaskId(e.target.value)}
                  disabled={!siteId}
                >
                  <option value="">(선택 안 함)</option>
                  {siteTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <div className="help">
                  {siteId
                    ? siteTasks.length === 0
                      ? "이 사이트에 등록된 과제가 없습니다."
                      : "이 사이트의 과제만 표시됩니다."
                    : "사이트를 먼저 선택하세요."}
                </div>
              </div>

              <div>
                <label className="lbl" htmlFor="occurred_at">
                  발생일시<span className="req">*</span>
                </label>
                <input
                  type="datetime-local"
                  id="occurred_at"
                  name="occurred_at"
                  defaultValue={draft.occurredAt}
                  required
                />
              </div>

              <div>
                <label className="lbl" htmlFor="type_id">
                  이슈 유형
                </label>
                <select
                  id="type_id"
                  name="type_id"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  <option value="">(선택 안 함)</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="severity">
                  심각도
                </label>
                <select id="severity" name="severity" defaultValue={draft.severity}>
                  {Object.entries(SEVERITIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="assignee_id">
                  담당자
                </label>
                <select id="assignee_id" name="assignee_id" defaultValue={draft.assigneeId}>
                  <option value="">(미지정)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>이슈 내용</h2>
          </div>
          <div className="card-body">
            <div className="form-row">
              <label className="lbl" htmlFor="title">
                제목<span className="req">*</span>
              </label>
              <input
                type="text"
                id="title"
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="예) 세금계산서 등록 중 로그인 화면에서 멈춤"
                required
                autoFocus
              />
            </div>

            <div className="form-row">
              <label className="lbl" htmlFor="symptom">
                증상 상세
              </label>
              <textarea
                id="symptom"
                name="symptom"
                rows={9}
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
                placeholder="어떤 상황에서 무엇이 어떻게 됐는지, 오류 메시지가 있으면 그대로 적어주세요."
              />
            </div>

            <div className="form-row">
              <label className="lbl" htmlFor="tags">
                태그
              </label>
              <input
                type="text"
                id="tags"
                name="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="쉼표로 구분 — 예) 로그인, 인증서, 타임아웃"
              />
              <div className="help">나중에 비슷한 이슈를 찾을 때 쓰입니다.</div>
            </div>

            <div className="form-row">
              <label className="lbl" htmlFor="files">
                첨부파일
              </label>
              <input type="file" id="files" name="files" ref={fileRef} multiple />
              <div className="help">
                오류 화면 캡처, 로그 파일 등 (1개당 최대 {MAX_UPLOAD_MB}MB)
              </div>
            </div>
          </div>
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "저장 중…" : mode === "edit" ? "저장" : "등록"}
          </button>
          {/* 온 곳으로 돌려보낸다. 점검에서 전환하다 취소했는데 이슈 목록으로
              떨어지면, 하던 점검을 직접 찾아 돌아가야 한다 */}
          <Link
            className="btn"
            href={
              source
                ? `/inspections/${source.runId}`
                : issueId
                  ? `/issues/${issueId}`
                  : "/issues"
            }
          >
            취소
          </Link>
        </div>
      </form>

      <aside className="card sticky">
        <div className="card-head">
          <h2>비슷한 이슈</h2>
          <span className="hint">{searching ? "찾는 중…" : "다른 사이트 사례 우선"}</span>
        </div>
        <div className="card-body tight">
          <SimilarList
            hits={hits}
            emptyText="제목이나 증상을 입력하면 비슷한 이슈를 찾아 보여줍니다."
          />
        </div>
      </aside>
    </div>
  );
}
