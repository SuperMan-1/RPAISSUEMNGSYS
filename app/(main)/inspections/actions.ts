"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/components/StateForm";
import { requireProfile } from "@/lib/auth";
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
