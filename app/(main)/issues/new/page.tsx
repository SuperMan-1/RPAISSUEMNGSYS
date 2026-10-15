import { IssueForm } from "@/components/IssueForm";
import { requireProfile } from "@/lib/auth";
import { formatDate, nowDateTimeLocal, toDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 등록 · RPA 이슈관리" };

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function NewIssuePage({ searchParams }: PageProps<"/issues/new">) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;

  const [sitesRes, tasksRes, typesRes, usersRes] = await Promise.all([
    supabase.from("sites").select("id, name").eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("tasks")
      .select("id, name, site_id")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("issue_types")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase.from("profiles").select("id, name").eq("is_active", true).order("name"),
  ]);

  // "이 내용으로 새 이슈" 로 들어온 경우 원본을 복사해 채운다
  const copyFrom = one(params.copy_from);
  let copied: {
    type_id: number | null;
    title: string;
    symptom: string;
    severity: string;
    tags: string;
  } | null = null;

  if (copyFrom) {
    const { data } = await supabase
      .from("issues")
      .select("type_id, title, symptom, severity, issue_tags(tags(name))")
      .eq("id", Number(copyFrom))
      .maybeSingle();

    if (data) {
      const tagNames = ((data.issue_tags ?? []) as unknown as {
        tags: { name: string } | null;
      }[])
        .map((t) => t.tags?.name)
        .filter((n): n is string => Boolean(n));

      copied = {
        type_id: data.type_id,
        title: data.title,
        symptom: data.symptom,
        severity: data.severity,
        tags: tagNames.join(", "),
      };
    }
  }

  // 정기점검의 이상(NG) 항목에서 전환해 들어온 경우
  const fromRun = one(params.from_run);
  const fromResult = one(params.from_result);
  let source: { runId: number; resultId: number; label: string } | undefined;
  let fromInspection: {
    siteId: string;
    taskId: string;
    title: string;
    symptom: string;
    occurredAt: string;
  } | null = null;

  if (fromRun && fromResult) {
    const [runRes, resultRes] = await Promise.all([
      supabase
        .from("inspection_runs")
        .select("id, site_id, task_id, inspected_at, template:inspection_templates(name)")
        .eq("id", Number(fromRun))
        .maybeSingle(),
      supabase
        .from("inspection_results")
        .select("id, seq, content, comment")
        .eq("id", Number(fromResult))
        .eq("run_id", Number(fromRun))
        .maybeSingle(),
    ]);

    const run = runRes.data as unknown as {
      id: number;
      site_id: number;
      task_id: number | null;
      inspected_at: string;
      template: { name: string } | null;
    } | null;
    const result = resultRes.data;

    if (run && result) {
      source = {
        runId: run.id,
        resultId: result.id,
        label: `${run.template?.name ?? "점검"} ${result.seq}번 항목 · ${formatDate(run.inspected_at)}`,
      };
      fromInspection = {
        siteId: String(run.site_id),
        taskId: run.task_id ? String(run.task_id) : "",
        title: result.content,
        symptom: result.comment ?? "",
        occurredAt: toDateTimeLocal(run.inspected_at),
      };
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>이슈 등록</h1>
          <p className="sub">
            입력하는 동안 오른쪽에 비슷한 이슈가 자동으로 표시됩니다.
          </p>
        </div>
      </div>

      <IssueForm
        mode="create"
        sites={sitesRes.data ?? []}
        tasks={tasksRes.data ?? []}
        types={typesRes.data ?? []}
        users={usersRes.data ?? []}
        source={source}
        draft={{
          siteId: fromInspection?.siteId ?? one(params.site_id),
          taskId: fromInspection?.taskId ?? one(params.task_id),
          typeId: copied?.type_id ? String(copied.type_id) : "",
          title: fromInspection?.title ?? copied?.title ?? "",
          symptom: fromInspection?.symptom ?? copied?.symptom ?? "",
          severity: copied?.severity ?? "MEDIUM",
          tags: copied?.tags ?? "",
          assigneeId: profile.id,
          occurredAt: fromInspection?.occurredAt ?? nowDateTimeLocal(),
        }}
      />
    </main>
  );
}
