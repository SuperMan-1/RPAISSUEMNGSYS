"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/StateForm";
import { insertAttachments, parseUploads } from "@/lib/attachments";
import { requireProfile } from "@/lib/auth";
import { ATTACHMENT_BUCKET } from "@/lib/constants";
import type { CheckResult } from "@/lib/database.types";
import { fromDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

const CHECK_VALUES: CheckResult[] = ["OK", "NG", "NA"];

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function id(formData: FormData, key: string): number | null {
  const v = str(formData, key);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// 점검 시작
//
// 템플릿의 항목을 "그 시점 문구 그대로" 복사해 결과 행을 미리 만들어 둔다.
// 나중에 템플릿이 바뀌어도 이 점검 기록은 변하지 않는다.
// ---------------------------------------------------------------------------

export async function startRun(_prev: FormState, formData: FormData): Promise<FormState> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const templateId = id(formData, "template_id");
  const siteId = id(formData, "site_id");
  if (!templateId) return { error: "점검 템플릿을 선택하세요." };
  if (!siteId) return { error: "사이트를 선택하세요." };

  const { data: items } = await supabase
    .from("inspection_items")
    .select("id, seq, content")
    .eq("template_id", templateId)
    .order("seq")
    .order("id");

  if (!items || items.length === 0) {
    return {
      error: "이 템플릿에는 점검 항목이 없습니다. 관리 → 점검 템플릿에서 항목을 먼저 등록하세요.",
    };
  }

  const { data: run, error } = await supabase
    .from("inspection_runs")
    .insert({
      template_id: templateId,
      site_id: siteId,
      task_id: id(formData, "task_id"),
      inspected_at: fromDateTimeLocal(str(formData, "inspected_at")),
      inspector_id: profile.id,
      status: "IN_PROGRESS",
      note: str(formData, "note") || null,
    })
    .select("id")
    .single();

  if (error || !run) {
    return { error: `점검 생성에 실패했습니다. (${error?.message ?? "알 수 없는 오류"})` };
  }

  const { error: resultError } = await supabase.from("inspection_results").insert(
    items.map((item) => ({
      run_id: run.id,
      item_id: item.id,
      content: item.content,
      result: "OK" as CheckResult,
      seq: item.seq,
    })),
  );

  if (resultError) {
    // 결과 행을 못 만들면 빈 점검만 남으므로 되돌린다
    await supabase.from("inspection_runs").delete().eq("id", run.id);
    return { error: `점검 항목 생성에 실패했습니다. (${resultError.message})` };
  }

  revalidatePath("/inspections");
  redirect(`/inspections/${run.id}`);
}

// ---------------------------------------------------------------------------
// 결과 저장
// ---------------------------------------------------------------------------

/** 폼에 담긴 항목별 결과를 읽어 저장한다 */
async function persistResults(formData: FormData, runId: number): Promise<void> {
  const supabase = await createClient();

  const ids = str(formData, "result_ids")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  for (const resultId of ids) {
    const raw = str(formData, `result_${resultId}`) as CheckResult;
    const result = CHECK_VALUES.includes(raw) ? raw : "OK";
    const comment = str(formData, `comment_${resultId}`);

    await supabase
      .from("inspection_results")
      .update({ result, comment: comment || null })
      .eq("id", resultId)
      .eq("run_id", runId);
  }

  const note = str(formData, "note");
  await supabase
    .from("inspection_runs")
    .update({ note: note || null })
    .eq("id", runId);
}

export async function saveResults(formData: FormData): Promise<void> {
  await requireProfile();
  const supabase = await createClient();

  const runId = id(formData, "run_id");
  if (!runId) throw new Error("점검을 찾을 수 없습니다.");

  await persistResults(formData, runId);

  // 제출한 버튼에 따라 완료 처리 여부가 갈린다
  const complete = str(formData, "complete") === "1";
  const reopen = str(formData, "reopen") === "1";

  if (complete) {
    await supabase.from("inspection_runs").update({ status: "DONE" }).eq("id", runId);
  } else if (reopen) {
    await supabase
      .from("inspection_runs")
      .update({ status: "IN_PROGRESS" })
      .eq("id", runId);
  }

  revalidatePath(`/inspections/${runId}`);
  revalidatePath("/inspections");
}

/**
 * 이상(NG) 항목을 이슈로 전환한다.
 *
 * 여기서 이슈를 바로 만들지 않고 이슈 등록 화면으로 넘긴다.
 * 그래야 등록하면서 "비슷한 이슈" 패널을 볼 수 있다.
 * 작성 중이던 점검 결과는 넘어가기 전에 저장한다.
 */
export async function saveAndConvert(formData: FormData): Promise<void> {
  await requireProfile();

  const runId = id(formData, "run_id");
  const resultId = id(formData, "convert_result_id");
  if (!runId) throw new Error("점검을 찾을 수 없습니다.");
  if (!resultId) throw new Error("전환할 점검 항목을 찾을 수 없습니다.");

  await persistResults(formData, runId);

  revalidatePath(`/inspections/${runId}`);
  redirect(`/issues/new?from_run=${runId}&from_result=${resultId}`);
}

/**
 * 이상(NG) 항목을 이 점검에서 이미 등록한 이슈에 묶는다.
 *
 * 한 가지 원인으로 여러 항목이 동시에 이상인 경우가 있다. 네트워크가 끊겨
 * 세 항목이 전부 실패했다면 이슈는 한 건이어야 맞다. 그럴 때 항목마다
 * 같은 내용의 이슈를 새로 만들지 않고 기존 이슈를 가리키게 한다.
 */
export async function linkToIssue(formData: FormData): Promise<void> {
  await requireProfile();

  const runId = id(formData, "run_id");
  const resultId = id(formData, "link_result_id");
  if (!runId) throw new Error("점검을 찾을 수 없습니다.");
  if (!resultId) throw new Error("묶을 점검 항목을 찾을 수 없습니다.");

  const issueId = id(formData, `link_issue_${resultId}`);
  if (!issueId) throw new Error("묶을 이슈를 고르세요.");

  await persistResults(formData, runId);

  const supabase = await createClient();

  // 서버 액션은 누구나 POST 할 수 있는 입구다. 폼이 보낸 id 를 그대로 믿지 않고,
  // 그 항목이 이 점검의 것인지와 그 이슈가 이 점검에서 나온 것인지를 확인한다.
  const [{ data: target }, { data: issue }] = await Promise.all([
    supabase
      .from("inspection_results")
      .select("id")
      .eq("id", resultId)
      .eq("run_id", runId)
      .maybeSingle(),
    supabase
      .from("issues")
      .select("id")
      .eq("id", issueId)
      .eq("source_run_id", runId)
      .maybeSingle(),
  ]);

  if (!target) throw new Error("이 점검의 항목이 아닙니다.");
  if (!issue) throw new Error("이 점검에서 등록된 이슈만 묶을 수 있습니다.");

  const { error } = await supabase
    .from("inspection_results")
    .update({ issue_id: issueId })
    .eq("id", resultId);

  if (error) throw new Error(`묶기에 실패했습니다. (${error.message})`);

  revalidatePath(`/inspections/${runId}`);
  revalidatePath(`/issues/${issueId}`);
}

/**
 * 잘못 묶은 항목의 연결을 끊는다.
 * 이슈 자체는 지우지 않는다. 점검 항목과의 연결만 푼다.
 */
export async function unlinkIssue(formData: FormData): Promise<void> {
  await requireProfile();

  const runId = id(formData, "run_id");
  const resultId = id(formData, "unlink_result_id");
  if (!runId) throw new Error("점검을 찾을 수 없습니다.");
  if (!resultId) throw new Error("점검 항목을 찾을 수 없습니다.");

  await persistResults(formData, runId);

  const supabase = await createClient();
  const { error } = await supabase
    .from("inspection_results")
    .update({ issue_id: null })
    .eq("id", resultId)
    .eq("run_id", runId);

  if (error) throw new Error(`연결 해제에 실패했습니다. (${error.message})`);

  revalidatePath(`/inspections/${runId}`);
}

// ---------------------------------------------------------------------------
// 점검 첨부파일
//
// 파일 자체는 브라우저가 Storage 로 직접 올린다 (lib/upload.ts).
// 여기서는 그 메타데이터만 받아 기록한다.
// ---------------------------------------------------------------------------

export async function addRunAttachments(formData: FormData): Promise<{ error: string } | undefined> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const runId = id(formData, "run_id");
  if (!runId) return { error: "점검을 찾을 수 없습니다." };

  const uploads = parseUploads(formData);
  if (uploads.length === 0) return { error: "올릴 파일을 선택하세요." };

  await insertAttachments(supabase, uploads, { run_id: runId }, profile.id);

  revalidatePath(`/inspections/${runId}`);
}

export async function deleteRunAttachment(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const attachmentId = id(formData, "attachment_id");
  const runId = id(formData, "run_id");
  if (!attachmentId) throw new Error("첨부파일을 찾을 수 없습니다.");

  const { data: att } = await supabase
    .from("attachments")
    .select("storage_path, uploaded_by")
    .eq("id", attachmentId)
    .maybeSingle();

  if (!att) throw new Error("첨부파일을 찾을 수 없습니다.");
  if (att.uploaded_by !== profile.id && profile.role !== "ADMIN") {
    throw new Error("올린 사람 또는 관리자만 삭제할 수 있습니다.");
  }

  await supabase.storage.from(ATTACHMENT_BUCKET).remove([att.storage_path]);

  const { error } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (error) throw new Error(`삭제에 실패했습니다. (${error.message})`);

  if (runId) revalidatePath(`/inspections/${runId}`);
}

export async function deleteRun(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const runId = id(formData, "run_id");
  if (!runId) throw new Error("점검을 찾을 수 없습니다.");

  const { data: run } = await supabase
    .from("inspection_runs")
    .select("inspector_id")
    .eq("id", runId)
    .maybeSingle();

  if (!run) throw new Error("점검을 찾을 수 없습니다.");
  if (run.inspector_id !== profile.id && profile.role !== "ADMIN") {
    throw new Error("점검자 또는 관리자만 삭제할 수 있습니다.");
  }

  const { error } = await supabase.from("inspection_runs").delete().eq("id", runId);
  if (error) throw new Error(`삭제에 실패했습니다. (${error.message})`);

  revalidatePath("/inspections");
  redirect("/inspections");
}
