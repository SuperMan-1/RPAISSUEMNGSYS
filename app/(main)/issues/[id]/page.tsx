import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/ActionForm";
import { ActionResultBadge, SeverityBadge, StatusBadge } from "@/components/Badges";
import { Attachments, type AttachmentView } from "@/components/Attachments";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { SimilarList } from "@/components/SimilarList";
import { requireProfile } from "@/lib/auth";
import { ATTACHMENT_BUCKET, ISSUE_STATUSES } from "@/lib/constants";
import type {
  ActionResult,
  IssueStatus,
  Severity,
  SimilarIssue,
} from "@/lib/database.types";
import { formatDateTime, nowDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { parseTags, tokenize } from "@/lib/tags";

import { changeAssignee, changeStatus, deleteAction, deleteIssue } from "../actions";

type IssueDetail = {
  id: number;
  no: string;
  title: string;
  symptom: string;
  severity: Severity;
  status: IssueStatus;
  occurred_at: string;
  closed_at: string | null;
  created_at: string;
  source_run_id: number | null;
  site_id: number;
  type_id: number | null;
  site: { id: number; name: string } | null;
  task: { id: number; name: string } | null;
  type: { name: string } | null;
  reporter: { id: string; name: string } | null;
  assignee: { id: string; name: string } | null;
  issue_tags: { tags: { name: string } | null }[];
};

type ActionRow = {
  id: number;
  acted_at: string;
  content: string;
  result: ActionResult;
  actor_id: string;
  actor: { name: string } | null;
};

export async function generateMetadata({ params }: PageProps<"/issues/[id]">) {
  const { id } = await params;
  return { title: `이슈 ${id} · RPA 이슈관리` };
}

export default async function IssueDetailPage({ params }: PageProps<"/issues/[id]">) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { id: rawId } = await params;
  const issueId = Number(rawId);
  if (!Number.isFinite(issueId)) notFound();

  const { data } = await supabase
    .from("issues")
    .select(
      `id, no, title, symptom, severity, status, occurred_at, closed_at, created_at,
       source_run_id, site_id, type_id,
       site:sites(id, name),
       task:tasks(id, name),
       type:issue_types(name),
       reporter:profiles!issues_reporter_id_fkey(id, name),
       assignee:profiles!issues_assignee_id_fkey(id, name),
       issue_tags(tags(name))`,
    )
    .eq("id", issueId)
    .maybeSingle();

  if (!data) notFound();
  const issue = data as unknown as IssueDetail;

  const [actionsRes, usersRes, issueFilesRes] = await Promise.all([
    supabase
      .from("actions")
      .select("id, acted_at, content, result, actor_id, actor:profiles(name)")
      .eq("issue_id", issueId)
      .order("acted_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("profiles").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("attachments")
      .select("id, file_name, content_type, size, storage_path")
      .eq("issue_id", issueId)
      .order("id"),
  ]);

  const actions = (actionsRes.data ?? []) as unknown as ActionRow[];
  const users = usersRes.data ?? [];
  const actionIds = actions.map((a) => a.id);

  const actionFilesRes =
    actionIds.length > 0
      ? await supabase
          .from("attachments")
          .select("id, action_id, file_name, content_type, size, storage_path")
          .in("action_id", actionIds)
          .order("id")
      : { data: [] as never[] };

  // 비공개 버킷이라 보기용 서명 URL을 만든다 (10분)
  const allFiles = [...(issueFilesRes.data ?? []), ...(actionFilesRes.data ?? [])] as {
    id: number;
    action_id?: number | null;
    file_name: string;
    content_type: string;
    size: number;
    storage_path: string;
  }[];

  const signedByPath = new Map<string, string>();
  if (allFiles.length > 0) {
    const { data: signed } = await supabase.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrls(
        allFiles.map((f) => f.storage_path),
        600,
      );
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }

  const toView = (f: (typeof allFiles)[number]): AttachmentView => ({
    id: f.id,
    file_name: f.file_name,
    content_type: f.content_type,
    size: f.size,
    url: signedByPath.get(f.storage_path) ?? null,
    isImage: (f.content_type ?? "").startsWith("image/"),
  });

  const issueAttachments = (issueFilesRes.data ?? []).map((f) => toView(f as never));
  const actionAttachments = new Map<number, AttachmentView[]>();
  for (const f of (actionFilesRes.data ?? []) as never as {
    action_id: number;
    id: number;
    file_name: string;
    content_type: string;
    size: number;
    storage_path: string;
  }[]) {
    const list = actionAttachments.get(f.action_id) ?? [];
    list.push(toView(f));
    actionAttachments.set(f.action_id, list);
  }

  // 유사 이슈
  const tagNames = issue.issue_tags
    .map((t) => t.tags?.name)
    .filter((n): n is string => Boolean(n));

  const { data: similarData } = await supabase.rpc("search_similar_issues", {
    p_tokens: tokenize(issue.title, issue.symptom, tagNames.join(" ")),
    p_tags: parseTags(tagNames.join(", ")),
    p_type_id: issue.type_id,
    p_site_id: issue.site_id,
    p_exclude_issue_id: issue.id,
    p_limit: 6,
  });
  const hits = (similarData ?? []) as SimilarIssue[];

  const canDelete = profile.role === "ADMIN" || issue.reporter?.id === profile.id;

  // 정기점검에서 전환된 이슈면 원천 점검을 보여준다
  let sourceRun: { id: number; label: string } | null = null;
  if (issue.source_run_id) {
    const { data: runRow } = await supabase
      .from("inspection_runs")
      .select("id, inspected_at, template:inspection_templates(name)")
      .eq("id", issue.source_run_id)
      .maybeSingle();

    const run = runRow as unknown as {
      id: number;
      inspected_at: string;
      template: { name: string } | null;
    } | null;

    if (run) {
      const { data: resultRow } = await supabase
        .from("inspection_results")
        .select("seq")
        .eq("issue_id", issue.id)
        .maybeSingle();

      const seq = resultRow?.seq;
      sourceRun = {
        id: run.id,
        label: `${run.template?.name ?? "점검"}${seq ? ` ${seq}번 항목` : ""} · ${formatDateTime(run.inspected_at)}`,
      };
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{issue.title}</h1>
          <p className="sub">
            <span className="mono">{issue.no}</span>
            <span className="sep">|</span>
            {issue.site?.name}
            {issue.task ? ` › ${issue.task.name}` : ""}
            <span className="sep">|</span>
            등록 {formatDateTime(issue.created_at)} ({issue.reporter?.name ?? "-"})
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href={`/issues/${issue.id}/edit`}>
            수정
          </Link>
          <Link
            className="btn"
            href={`/issues/new?copy_from=${issue.id}&site_id=${issue.site_id}`}
          >
            이 내용으로 새 이슈
          </Link>
          {canDelete && (
            <form action={deleteIssue}>
              <input type="hidden" name="issue_id" value={issue.id} />
              <ConfirmSubmit
                className="btn"
                message={`이슈 ${issue.no} 과(와) 처리 이력·첨부를 모두 삭제합니다. 계속할까요?`}
              >
                삭제
              </ConfirmSubmit>
            </form>
          )}
        </div>
      </div>

      {sourceRun && (
        <div className="flash flash-warn">
          이 이슈는 정기점검에서 전환됐습니다 —{" "}
          <Link href={`/inspections/${sourceRun.id}`}>원천 점검: {sourceRun.label}</Link>
        </div>
      )}

      <div className="split">
        <div>
          {/* 이슈 정보 */}
          <div className="card">
            <div className="card-head">
              <h2>이슈 정보</h2>
              <div className="btn-row">
                <SeverityBadge severity={issue.severity} />
                <StatusBadge status={issue.status} />
              </div>
            </div>
            <div className="card-body">
              <div className="meta">
                <div>
                  <div className="k">사이트</div>
                  <div className="v">{issue.site?.name ?? "-"}</div>
                </div>
                <div>
                  <div className="k">과제</div>
                  <div className="v">{issue.task?.name ?? "-"}</div>
                </div>
                <div>
                  <div className="k">유형</div>
                  <div className="v">{issue.type?.name ?? "-"}</div>
                </div>
                <div>
                  <div className="k">발생일시</div>
                  <div className="v">{formatDateTime(issue.occurred_at)}</div>
                </div>
                <div>
                  <div className="k">등록자</div>
                  <div className="v">{issue.reporter?.name ?? "-"}</div>
                </div>
                <div>
                  <div className="k">담당자</div>
                  <div className="v">{issue.assignee?.name ?? "미지정"}</div>
                </div>
                {issue.closed_at && (
                  <div>
                    <div className="k">종료일시</div>
                    <div className="v">{formatDateTime(issue.closed_at)}</div>
                  </div>
                )}
              </div>

              {tagNames.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {tagNames.map((name) => (
                    <Link
                      key={name}
                      className="tag"
                      href={`/issues?tag=${encodeURIComponent(name)}`}
                    >
                      #{name}
                    </Link>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <div className="k" style={{ fontSize: 12, color: "var(--text-faint)", fontWeight: 600 }}>
                  증상
                </div>
                <div className="prose" style={{ marginTop: 4 }}>
                  {issue.symptom || "(내용 없음)"}
                </div>
              </div>

              <Attachments items={issueAttachments} />
            </div>
          </div>

          {/* 처리 이력 */}
          <div className="card" id="actions">
            <div className="card-head">
              <h2>처리 이력 {actions.length}건</h2>
              <span className="hint">날짜별로 여러 번 등록할 수 있습니다</span>
            </div>
            <div className="card-body tight">
              {actions.length > 0 ? (
                <ul className="timeline">
                  {actions.map((a) => (
                    <li key={a.id}>
                      <div className="t-head">
                        <span className="who">{a.actor?.name ?? "-"}</span>
                        <span>{formatDateTime(a.acted_at)}</span>
                        <ActionResultBadge result={a.result} />
                        {(a.actor_id === profile.id || profile.role === "ADMIN") && (
                          <form action={deleteAction} className="spacer">
                            <input type="hidden" name="action_id" value={a.id} />
                            <input type="hidden" name="issue_id" value={issue.id} />
                            <ConfirmSubmit message="이 처리 이력을 삭제할까요?">
                              삭제
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                      <div className="prose">{a.content}</div>
                      <Attachments items={actionAttachments.get(a.id) ?? []} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">아직 등록된 처리 이력이 없습니다.</div>
              )}
            </div>
          </div>

          {/* 처리 이력 등록 */}
          <div className="card">
            <div className="card-head">
              <h2>처리 이력 등록</h2>
              <span className="hint">
                아직 해결하지 못했어도 경과를 남겨두세요
              </span>
            </div>
            <div className="card-body">
              <ActionForm
                issueId={issue.id}
                defaultActedAt={nowDateTimeLocal()}
                canClose={issue.status !== "CLOSED"}
              />
            </div>
          </div>
        </div>

        {/* 사이드 */}
        <div>
          <div className="card">
            <div className="card-head">
              <h2>상태 변경</h2>
            </div>
            <div className="card-body">
              <form action={changeStatus} className="btn-row">
                <input type="hidden" name="issue_id" value={issue.id} />
                <select name="status" defaultValue={issue.status} style={{ flex: 1 }}>
                  {Object.entries(ISSUE_STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn">
                  변경
                </button>
              </form>

              <form action={changeAssignee} className="btn-row" style={{ marginTop: 10 }}>
                <input type="hidden" name="issue_id" value={issue.id} />
                <select
                  name="assignee_id"
                  defaultValue={issue.assignee?.id ?? ""}
                  style={{ flex: 1 }}
                >
                  <option value="">(미지정)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn">
                  담당자
                </button>
              </form>
            </div>
          </div>

          <div className="card sticky">
            <div className="card-head">
              <h2>비슷한 이슈</h2>
              <span className="hint">다른 사이트 사례 우선</span>
            </div>
            <div className="card-body tight">
              <SimilarList hits={hits} copyTargetId="content" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
