import Link from "next/link";

import { InspectionStartForm, type TemplateOption } from "@/components/InspectionStartForm";
import { requireProfile } from "@/lib/auth";
import { nowDateTimeLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "점검 수행 · RPA 이슈관리" };

type TemplateRow = {
  id: number;
  name: string;
  site_id: number | null;
  inspection_items: { count: number }[];
};

export default async function NewInspectionPage() {
  await requireProfile();
  const supabase = await createClient();

  const [templatesRes, sitesRes, tasksRes] = await Promise.all([
    supabase
      .from("inspection_templates")
      .select("id, name, site_id, inspection_items(count)")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("sites")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("tasks")
      .select("id, name, site_id")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const templates: TemplateOption[] = ((templatesRes.data ?? []) as unknown as TemplateRow[]).map(
    (t) => ({
      id: t.id,
      name: t.name,
      site_id: t.site_id,
      itemCount: t.inspection_items?.[0]?.count ?? 0,
    }),
  );

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>점검 수행</h1>
          <p className="sub">
            템플릿을 고르면 그 시점의 점검 항목을 복사해 점검표를 만듭니다.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/inspections">
            점검 이력
          </Link>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 820 }}>
        <div className="card-head">
          <h2>점검 정보</h2>
        </div>
        <div className="card-body">
          {templates.length > 0 ? (
            <InspectionStartForm
              templates={templates}
              sites={sitesRes.data ?? []}
              tasks={tasksRes.data ?? []}
              defaultInspectedAt={nowDateTimeLocal()}
            />
          ) : (
            <div className="flash flash-warn mb0">
              쓸 수 있는 점검 템플릿이 없습니다. 관리자에게 <strong>관리 → 점검 템플릿</strong>
              에서 템플릿과 항목을 등록해 달라고 요청하세요.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
