import { notFound } from "next/navigation";

import { IssueForm } from "@/components/IssueForm";
import { requireProfile } from "@/lib/auth";
import { toDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 수정 · RPA 이슈관리" };

export default async function EditIssuePage({ params }: PageProps<"/issues/[id]/edit">) {
  await requireProfile();
  const supabase = await createClient();

  const { id: rawId } = await params;
  const issueId = Number(rawId);
  if (!Number.isFinite(issueId)) notFound();

  const [issueRes, sitesRes, tasksRes, typesRes, usersRes] = await Promise.all([
    supabase
      .from("issues")
      .select(
        `id, no, site_id, task_id, type_id, title, symptom, severity,
         occurred_at, assignee_id, issue_tags(tags(name))`,
      )
      .eq("id", issueId)
      .maybeSingle(),
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

  const issue = issueRes.data;
  if (!issue) notFound();

  // 손으로 쓴 Database 타입에는 관계 정보가 없어 중첩 select 는 직접 단언한다
  // (Supabase 프로젝트 생성 후 supabase gen types 로 다시 만들면 불필요해진다)
  const tagNames = ((issue.issue_tags ?? []) as unknown as {
    tags: { name: string } | null;
  }[])
    .map((t) => t.tags?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>이슈 수정</h1>
          <p className="sub">
            <span className="mono">{issue.no}</span>
          </p>
        </div>
      </div>

      <IssueForm
        mode="edit"
        issueId={issue.id}
        sites={sitesRes.data ?? []}
        tasks={tasksRes.data ?? []}
        types={typesRes.data ?? []}
        users={usersRes.data ?? []}
        draft={{
          siteId: String(issue.site_id),
          taskId: issue.task_id ? String(issue.task_id) : "",
          typeId: issue.type_id ? String(issue.type_id) : "",
          title: issue.title,
          symptom: issue.symptom,
          severity: issue.severity,
          tags: tagNames.join(", "),
          assigneeId: issue.assignee_id ?? "",
          occurredAt: toDateTimeLocal(issue.occurred_at),
        }}
      />
    </main>
  );
}
