"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { insertAttachments, parseUploads } from "@/lib/attachments";
import { requireProfile } from "@/lib/auth";
import { ATTACHMENT_BUCKET } from "@/lib/constants";
import type {
  ActionResult,
  IssueStatus,
  Severity,
  SimilarIssue,
} from "@/lib/database.types";
import { fromDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { parseTags, syncIssueTags, tokenize } from "@/lib/tags";

export type ActionError = { error: string } | undefined;

const SEVERITY_VALUES: Severity[] = ["HIGH", "MEDIUM", "LOW"];
const STATUS_VALUES: IssueStatus[] = [
  "RECEIVED",
  "IN_PROGRESS",
  "ACTION_DONE",
  "CLOSED",
  "ON_HOLD",
];
const RESULT_VALUES: ActionResult[] = ["RESOLVED", "TEMPORARY", "UNRESOLVED"];

// ---------------------------------------------------------------------------
// 입력 변환 헬퍼
// ---------------------------------------------------------------------------

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function optionalId(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optionalUuid(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v || null;
}

// ---------------------------------------------------------------------------
// 이슈 등록 / 수정
// ---------------------------------------------------------------------------

export async function createIssue(formData: FormData): Promise<ActionError> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const siteId = optionalId(formData, "site_id");
  const title = str(formData, "title");

  if (!siteId) return { error: "사이트를 선택하세요." };
  if (!title) return { error: "제목을 입력하세요." };

  const severityRaw = str(formData, "severity") as Severity;
  const severity = SEVERITY_VALUES.includes(severityRaw) ? severityRaw : "MEDIUM";

  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      site_id: siteId,
      task_id: optionalId(formData, "task_id"),
      type_id: optionalId(formData, "type_id"),
      title,
      symptom: str(formData, "symptom"),
      severity,
      occurred_at: fromDateTimeLocal(str(formData, "occurred_at")),
      reporter_id: profile.id,
      assignee_id: optionalUuid(formData, "assignee_id"),
      source_run_id: optionalId(formData, "source_run_id"),
    })
    .select("id, no")
    .single();

  if (error || !issue) {
    return { error: `이슈 등록에 실패했습니다. (${error?.message ?? "알 수 없는 오류"})` };
  }

  await syncIssueTags(supabase, issue.id, parseTags(str(formData, "tags")));
  await insertAttachments(supabase, parseUploads(formData), { issue_id: issue.id }, profile.id);

  // 정기점검의 이상 항목에서 전환된 경우 양방향으로 연결한다
  const fromResultId = optionalId(formData, "from_result_id");
  const sourceRunId = optionalId(formData, "source_run_id");

  if (fromResultId) {
    await supabase
      .from("inspection_results")
      .update({ issue_id: issue.id })
      .eq("id", fromResultId);

    if (sourceRunId) revalidatePath(`/inspections/${sourceRunId}`);
    revalidatePath("/inspections");
  }

  revalidatePath("/issues");
  revalidatePath("/");

  // 점검에서 전환해 들어온 경우에는 점검 화면으로 되돌린다.
  // 한 점검에서 이상이 여러 건 나오면 계속 전환해야 하는데,
  // 이슈 상세로 떨어지면 매번 점검을 다시 찾아가야 한다.
  if (sourceRunId && fromResultId) {
    redirect(`/inspections/${sourceRunId}?created=${issue.id}`);
  }

  redirect(`/issues/${issue.id}`);
}

export async function updateIssue(formData: FormData): Promise<ActionError> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const issueId = optionalId(formData, "issue_id");
  const siteId = optionalId(formData, "site_id");
  const title = str(formData, "title");

  if (!issueId) return { error: "이슈를 찾을 수 없습니다." };
  if (!siteId) return { error: "사이트를 선택하세요." };
  if (!title) return { error: "제목을 입력하세요." };

  const severityRaw = str(formData, "severity") as Severity;
  const severity = SEVERITY_VALUES.includes(severityRaw) ? severityRaw : "MEDIUM";

  const { error } = await supabase
    .from("issues")
    .update({
      site_id: siteId,
      task_id: optionalId(formData, "task_id"),
      type_id: optionalId(formData, "type_id"),
      title,
      symptom: str(formData, "symptom"),
      severity,
      occurred_at: fromDateTimeLocal(str(formData, "occurred_at")),
      assignee_id: optionalUuid(formData, "assignee_id"),
    })
    .eq("id", issueId);

  if (error) return { error: `이슈 수정에 실패했습니다. (${error.message})` };

  await syncIssueTags(supabase, issueId, parseTags(str(formData, "tags")));
  await insertAttachments(supabase, parseUploads(formData), { issue_id: issueId }, profile.id);

  revalidatePath("/issues");
  revalidatePath(`/issues/${issueId}`);
  redirect(`/issues/${issueId}`);
}

export async function deleteIssue(formData: FormData): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const issueId = optionalId(formData, "issue_id");
  if (!issueId) throw new Error("이슈를 찾을 수 없습니다.");

  // DB 행은 on delete cascade 로 사라지지만 Storage 파일은 남으므로 직접 지운다
  const { data: actionRows } = await supabase
    .from("actions")
    .select("id")
    .eq("issue_id", issueId);
  const actionIds = (actionRows ?? []).map((a) => a.id);

  const [issueFiles, actionFiles] = await Promise.all([
    supabase.from("attachments").select("storage_path").eq("issue_id", issueId),
    actionIds.length > 0
      ? supabase.from("attachments").select("storage_path").in("action_id", actionIds)
      : Promise.resolve({ data: [] as { storage_path: string }[] }),
  ]);

  const paths = [...(issueFiles.data ?? []), ...(actionFiles.data ?? [])].map(
    (f) => f.storage_path,
  );
  if (paths.length > 0) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
  }

  const { error } = await supabase.from("issues").delete().eq("id", issueId);
  if (error) throw new Error(`삭제에 실패했습니다. (${error.message})`);

  revalidatePath("/issues");
  revalidatePath("/");
  redirect("/issues");
}

// ---------------------------------------------------------------------------
// 상태 / 담당자
// ---------------------------------------------------------------------------

export async function changeStatus(formData: FormData): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const issueId = optionalId(formData, "issue_id");
  const status = str(formData, "status") as IssueStatus;

  if (!issueId) throw new Error("이슈를 찾을 수 없습니다.");
  if (!STATUS_VALUES.includes(status)) throw new Error("알 수 없는 상태입니다.");

  const { error } = await supabase
    .from("issues")
    .update({
      status,
      closed_at: status === "CLOSED" ? new Date().toISOString() : null,
    })
    .eq("id", issueId);

  if (error) throw new Error(`상태 변경에 실패했습니다. (${error.message})`);

  revalidatePath(`/issues/${issueId}`);
  revalidatePath("/issues");
}

export async function changeAssignee(formData: FormData): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const issueId = optionalId(formData, "issue_id");
  if (!issueId) throw new Error("이슈를 찾을 수 없습니다.");

  const { error } = await supabase
    .from("issues")
    .update({ assignee_id: optionalUuid(formData, "assignee_id") })
    .eq("id", issueId);

  if (error) throw new Error(`담당자 변경에 실패했습니다. (${error.message})`);

  revalidatePath(`/issues/${issueId}`);
  revalidatePath("/issues");
}

// ---------------------------------------------------------------------------
// 처리 이력 (조치사항)
// ---------------------------------------------------------------------------

export async function addAction(formData: FormData): Promise<ActionError> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const issueId = optionalId(formData, "issue_id");
  const content = str(formData, "content");

  if (!issueId) return { error: "이슈를 찾을 수 없습니다." };
  if (!content) return { error: "처리내용을 입력하세요." };

  const resultRaw = str(formData, "result") as ActionResult;
  const result = RESULT_VALUES.includes(resultRaw) ? resultRaw : "RESOLVED";

  const { data: action, error } = await supabase
    .from("actions")
    .insert({
      issue_id: issueId,
      acted_at: fromDateTimeLocal(str(formData, "acted_at")),
      actor_id: profile.id,
      content,
      result,
    })
    .select("id")
    .single();

  if (error || !action) {
    return { error: `처리 이력 등록에 실패했습니다. (${error?.message ?? "알 수 없는 오류"})` };
  }

  await insertAttachments(supabase, parseUploads(formData), { action_id: action.id }, profile.id);

  // 이슈 상태 자동 반영 (prod.md 7.2)
  const closeIssue = str(formData, "close_issue") === "1";
  const { data: issue } = await supabase
    .from("issues")
    .select("status")
    .eq("id", issueId)
    .single();

  if (closeIssue) {
    await supabase
      .from("issues")
      .update({ status: "CLOSED", closed_at: new Date().toISOString() })
      .eq("id", issueId);
  } else if (result === "RESOLVED") {
    await supabase.from("issues").update({ status: "ACTION_DONE" }).eq("id", issueId);
  } else if (issue?.status === "RECEIVED") {
    await supabase.from("issues").update({ status: "IN_PROGRESS" }).eq("id", issueId);
  }

  revalidatePath(`/issues/${issueId}`);
  revalidatePath("/issues");
}

export async function deleteAction(formData: FormData): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const actionId = optionalId(formData, "action_id");
  const issueId = optionalId(formData, "issue_id");
  if (!actionId) throw new Error("처리 이력을 찾을 수 없습니다.");

  const { data: files } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("action_id", actionId);

  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length > 0) {
    await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
  }

  const { error } = await supabase.from("actions").delete().eq("id", actionId);
  if (error) throw new Error(`삭제에 실패했습니다. (${error.message})`);

  if (issueId) revalidatePath(`/issues/${issueId}`);
  revalidatePath("/issues");
}

// ---------------------------------------------------------------------------
// 유사이슈 검색 (등록 화면에서 입력 중에 호출)
// ---------------------------------------------------------------------------

export type SimilarQuery = {
  title: string;
  symptom: string;
  tags: string;
  typeId: number | null;
  siteId: number | null;
  excludeIssueId: number | null;
};

export async function searchSimilar(q: SimilarQuery): Promise<SimilarIssue[]> {
  await requireProfile();
  const supabase = await createClient();

  const tokens = tokenize(q.title, q.symptom, q.tags);
  const tags = parseTags(q.tags);

  if (tokens.length === 0 && tags.length === 0 && !q.typeId) return [];

  const { data, error } = await supabase.rpc("search_similar_issues", {
    p_tokens: tokens,
    p_tags: tags,
    p_type_id: q.typeId,
    p_site_id: q.siteId,
    p_exclude_issue_id: q.excludeIssueId,
    p_limit: 8,
  });

  if (error) return [];
  return (data ?? []) as SimilarIssue[];
}
