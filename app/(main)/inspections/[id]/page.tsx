import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/Badges";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { PrintButton } from "@/components/PrintButton";
import { InspectionResultsForm, type ResultRow } from "@/components/InspectionResultsForm";
import { RunAttachmentForm } from "@/components/RunAttachmentForm";
import { requireProfile } from "@/lib/auth";
import { ATTACHMENT_BUCKET, RUN_STATUSES } from "@/lib/constants";
import type { CheckResult, IssueStatus, RunStatus } from "@/lib/database.types";
import { formatDateTime, formatFileSize } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { deleteRun, deleteRunAttachment } from "../actions";

type RunDetail = {
  id: number;
  inspected_at: string;
  status: RunStatus;
  note: string | null;
  inspector_id: string;
  template: { id: number; name: string } | null;
  site: { id: number; name: string } | null;
  task: { id: number; name: string } | null;
  inspector: { name: string } | null;
};

type ResultWithIssue = {
  id: number;
  seq: number;
  content: string;
  result: CheckResult;
  comment: string | null;
  issue_id: number | null;
  item_id: number | null;
  issue: { no: string } | null;
};

export async function generateMetadata({ params }: PageProps<"/inspections/[id]">) {
  const { id } = await params;
  return { title: `점검 ${id} · RPA 이슈관리` };
}

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function InspectionDetailPage({
  params,
  searchParams,
}: PageProps<"/inspections/[id]">) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { id: rawId } = await params;
  const runId = Number(rawId);
  if (!Number.isFinite(runId)) notFound();

  const { data } = await supabase
    .from("inspection_runs")
    .select(
      `id, inspected_at, status, note, inspector_id,
       template:inspection_templates(id, name),
       site:sites(id, name),
       task:tasks(id, name),
       inspector:profiles(name)`,
    )
    .eq("id", runId)
    .maybeSingle();

  if (!data) notFound();
  const run = data as unknown as RunDetail;

  const { data: resultData } = await supabase
    .from("inspection_results")
    .select("id, seq, content, result, comment, issue_id, item_id, issue:issues(no)")
    .eq("run_id", runId)
    .order("seq")
    .order("id");

  const results = (resultData ?? []) as unknown as ResultWithIssue[];

  // 템플릿 항목의 비고(판정 기준)를 같이 보여준다
  const itemIds = results.map((r) => r.item_id).filter((v): v is number => Boolean(v));
  const notesByItem = new Map<number, string>();
  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from("inspection_items")
      .select("id, note")
      .in("id", itemIds);
    for (const item of items ?? []) {
      if (item.note) notesByItem.set(item.id, item.note);
    }
  }

  const rows: ResultRow[] = results.map((r) => ({
    id: r.id,
    seq: r.seq,
    content: r.content,
    result: r.result,
    comment: r.comment,
    issue_id: r.issue_id,
    issue_no: r.issue?.no ?? null,
    note: r.item_id ? (notesByItem.get(r.item_id) ?? null) : null,
  }));

  const ngCount = results.filter((r) => r.result === "NG").length;
  const linkedIssues = results.filter((r) => r.issue_id);

  // 같은 원인의 다른 항목을 묶을 수 있도록, 이 점검에서 이미 등록한 이슈를 모은다
  const linkable = [
    ...new Map(
      results
        .filter((r) => r.issue_id && r.issue?.no)
        .map((r) => [r.issue_id as number, { id: r.issue_id as number, no: r.issue!.no }]),
    ).values(),
  ];

  // 이 점검에서 등록됐지만 지금은 어느 항목과도 연결돼 있지 않은 이슈.
  // 여러 항목을 한 이슈로 합치고 나면 이렇게 뜬 이슈가 남는데, 알려주지 않으면
  // 아무도 모르고 방치된다. 처리 이력 건수를 같이 보여줘야 지워도 되는지 판단할 수 있다.
  const linkedIds = new Set(results.map((r) => r.issue_id).filter(Boolean));
  const { data: fromRun } = await supabase
    .from("issues")
    .select("id, no, title, status")
    .eq("source_run_id", runId)
    .order("id");

  const orphans = (fromRun ?? []).filter((i) => !linkedIds.has(i.id));
  const orphanActionCount = new Map<number, number>();
  if (orphans.length > 0) {
    const { data: orphanActions } = await supabase
      .from("actions")
      .select("issue_id")
      .in(
        "issue_id",
        orphans.map((i) => i.id),
      );
    for (const a of orphanActions ?? []) {
      orphanActionCount.set(a.issue_id, (orphanActionCount.get(a.issue_id) ?? 0) + 1);
    }
  }

  // 전환·묶기·저장을 마치고 이 화면으로 되돌아왔을 때의 안내
  const sp = await searchParams;
  const createdIssue = one(sp.created)
    ? (linkable.find((i) => i.id === Number(one(sp.created))) ?? null)
    : null;
  const linkedIssue = one(sp.linked)
    ? (linkable.find((i) => i.id === Number(one(sp.linked))) ?? null)
    : null;
  const notice = createdIssue
    ? null
    : linkedIssue
      ? `점검 항목을 이슈 ${linkedIssue.no} 에 묶었습니다.`
      : one(sp.unlinked)
        ? "이슈 연결을 해제했습니다. 이슈 자체는 그대로 있습니다."
        : one(sp.reopened)
          ? "점검을 다시 열었습니다. 이어서 수정할 수 있습니다."
          : one(sp.saved)
            ? run.status === "DONE"
              ? "점검 내용을 저장했습니다."
              : "점검 내용을 저장했습니다. 아직 완료 처리하지 않았습니다."
            : null;
  const canDelete = run.inspector_id === profile.id || profile.role === "ADMIN";

  // 첨부파일 — 비공개 버킷이라 보기용 서명 URL을 만든다 (10분)
  const { data: fileRows } = await supabase
    .from("attachments")
    .select("id, file_name, content_type, size, storage_path, uploaded_by")
    .eq("run_id", runId)
    .order("id");

  const files = fileRows ?? [];
  const signedByPath = new Map<string, string>();
  if (files.length > 0) {
    const { data: signed } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(
        files.map((f) => f.storage_path),
        600,
      );
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }

  const attachments = files.map((f) => ({
    id: f.id,
    name: f.file_name,
    size: f.size,
    url: signedByPath.get(f.storage_path) ?? null,
    isImage: (f.content_type ?? "").startsWith("image/"),
    canRemove: f.uploaded_by === profile.id || profile.role === "ADMIN",
  }));

  return (
    <main className="page">
      {createdIssue && (
        <div className="flash flash-ok">
          이슈 <Link href={`/issues/${createdIssue.id}`}>{createdIssue.no}</Link> 을(를)
          등록했습니다. 남은 이상 항목이 있으면 이어서 전환하세요.
        </div>
      )}
      {notice && <div className="flash flash-ok">{notice}</div>}

      <div className="page-head">
        <div>
          <h1>{run.template?.name ?? "점검"}</h1>
          <p className="sub">
            {run.site?.name}
            {run.task ? ` › ${run.task.name}` : ""}
            <span className="sep">|</span>
            {formatDateTime(run.inspected_at)}
            <span className="sep">|</span>
            점검자 {run.inspector?.name ?? "-"}
          </p>
        </div>
        <div className="page-actions">
          <span
            className={`badge ${run.status === "DONE" ? "badge-ok" : "badge-warn"}`}
            style={{ alignSelf: "center" }}
          >
            {RUN_STATUSES[run.status]}
          </span>
          {ngCount > 0 && (
            <span className="badge badge-danger" style={{ alignSelf: "center" }}>
              이상 {ngCount}건
            </span>
          )}
          <a className="btn" href={`/inspections/${run.id}/export`}>
            엑셀 받기
          </a>
          <PrintButton />
          <Link className="btn" href="/inspections">
            점검 이력
          </Link>
          {canDelete && (
            <form action={deleteRun}>
              <input type="hidden" name="run_id" value={run.id} />
              <ConfirmSubmit
                className="btn"
                message="이 점검 기록을 삭제합니다. 계속할까요? (전환된 이슈는 남습니다)"
              >
                삭제
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {linkedIssues.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>이 점검에서 발생한 이슈 {linkedIssues.length}건</h2>
          </div>
          <div className="card-body tight">
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap">이슈번호</th>
                    <th>점검 항목</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedIssues.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap mono small">
                        <Link href={`/issues/${r.issue_id}`}>{r.issue?.no}</Link>
                      </td>
                      <td className="small">
                        {r.seq}. {r.content}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {orphans.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>연결이 끊긴 이슈 {orphans.length}건</h2>
            <span className="hint">
              이 점검에서 등록됐지만 지금은 어느 항목과도 연결돼 있지 않습니다
            </span>
          </div>
          <div className="card-body tight">
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap" style={{ width: 110 }}>
                      이슈번호
                    </th>
                    <th>제목</th>
                    <th className="nowrap" style={{ width: 90 }}>
                      상태
                    </th>
                    <th className="nowrap" style={{ width: 90 }}>
                      처리 이력
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.map((i) => {
                    const count = orphanActionCount.get(i.id) ?? 0;
                    return (
                      <tr key={i.id}>
                        <td className="nowrap mono small">
                          <Link href={`/issues/${i.id}`}>{i.no}</Link>
                        </td>
                        <td className="small">
                          <Link href={`/issues/${i.id}`}>{i.title}</Link>
                        </td>
                        <td className="nowrap">
                          <StatusBadge status={i.status as IssueStatus} />
                        </td>
                        <td className="nowrap small">
                          {count > 0 ? `${count}건` : <span className="dim">없음</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="small dim" style={{ padding: "8px 12px 12px" }}>
              여러 항목을 한 이슈로 합치면 이렇게 남습니다. 처리 이력이 <strong>없음</strong>
              이면 지워도 잃을 것이 없습니다. 이슈 화면에서 삭제하세요. 이력이 있다면 누군가
              작업한 내용이 들어 있으니 확인하고 지우세요.
            </div>
          </div>
        </div>
      )}

      <InspectionResultsForm
        runId={run.id}
        isDone={run.status === "DONE"}
        note={run.note}
        rows={rows}
        linkable={linkable}
      />

      <div className="card">
        <div className="card-head">
          <h2>첨부파일 {attachments.length}건</h2>
          <span className="hint">점검 화면 캡처, 로그 파일 등</span>
        </div>
        <div className="card-body">
          {attachments.length > 0 ? (
            <>
              <ul className="attach-list">
                {attachments.map((a) => (
                  <li key={a.id}>
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                    ) : (
                      <span className="dim">{a.name}</span>
                    )}
                    <span className="dim"> · {formatFileSize(a.size)}</span>
                    {a.canRemove && (
                      <form action={deleteRunAttachment} style={{ display: "inline" }}>
                        <input type="hidden" name="attachment_id" value={a.id} />
                        <input type="hidden" name="run_id" value={run.id} />
                        <ConfirmSubmit
                          className="linkbtn"
                          message={`'${a.name}' 을(를) 삭제할까요?`}
                        >
                          <span style={{ color: "var(--danger)", marginLeft: 8 }}>삭제</span>
                        </ConfirmSubmit>
                      </form>
                    )}
                  </li>
                ))}
              </ul>

              {attachments.some((a) => a.isImage && a.url) && (
                <div className="thumbs">
                  {attachments
                    .filter((a) => a.isImage && a.url)
                    .map((a) => (
                      <a key={a.id} href={a.url!} target="_blank" rel="noreferrer">
                        {/* 서명 URL이라 next/image 최적화 대상이 아니다 */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url!} alt={a.name} />
                      </a>
                    ))}
                </div>
              )}

              <hr
                style={{
                  border: 0,
                  borderTop: "1px solid var(--border)",
                  margin: "16px 0",
                }}
              />
            </>
          ) : (
            <p className="dim small" style={{ marginTop: 0 }}>
              아직 올린 파일이 없습니다.
            </p>
          )}

          <RunAttachmentForm runId={run.id} />
        </div>
      </div>
    </main>
  );
}
