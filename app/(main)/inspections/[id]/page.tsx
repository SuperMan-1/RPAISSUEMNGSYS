import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { InspectionResultsForm, type ResultRow } from "@/components/InspectionResultsForm";
import { requireProfile } from "@/lib/auth";
import { RUN_STATUSES } from "@/lib/constants";
import type { CheckResult, RunStatus } from "@/lib/database.types";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { deleteRun } from "../actions";

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

export default async function InspectionDetailPage({
  params,
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
  const canDelete = run.inspector_id === profile.id || profile.role === "ADMIN";

  return (
    <main className="page">
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

      <InspectionResultsForm
        runId={run.id}
        isDone={run.status === "DONE"}
        note={run.note}
        rows={rows}
      />
    </main>
  );
}
