import Link from "next/link";

import { StateForm } from "@/components/StateForm";
import { createClient } from "@/lib/supabase/server";

import { createTemplate } from "../actions";

export const metadata = { title: "점검 템플릿 관리 · RPA 이슈관리" };

type TemplateRow = {
  id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  site: { name: string } | null;
  inspection_items: { count: number }[];
};

export default async function AdminTemplatesPage() {
  const supabase = await createClient();

  const [templatesRes, sitesRes] = await Promise.all([
    supabase
      .from("inspection_templates")
      .select("id, name, description, is_active, site:sites(name), inspection_items(count)")
      .order("name"),
    supabase
      .from("sites")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
  ]);

  const templates = (templatesRes.data ?? []) as unknown as TemplateRow[];
  const sites = sitesRes.data ?? [];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>점검 템플릿 {templates.length}개</h2>
          <span className="hint">템플릿을 눌러 점검 항목을 관리합니다</span>
        </div>
        <div className="card-body tight">
          {templates.length > 0 ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>이름</th>
                    <th className="nowrap">적용 사이트</th>
                    <th className="nowrap">항목</th>
                    <th>설명</th>
                    <th className="nowrap">사용</th>
                  </tr>
                </thead>
                <tbody>
                  {templates.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link href={`/admin/templates/${t.id}`}>{t.name}</Link>
                      </td>
                      <td className="nowrap small">{t.site?.name ?? "공통"}</td>
                      <td className="nowrap small">
                        {t.inspection_items?.[0]?.count ?? 0}개
                      </td>
                      <td className="small dim">{t.description ?? ""}</td>
                      <td className="nowrap">
                        <span
                          className={`badge ${t.is_active ? "badge-ok" : "badge-neutral"}`}
                        >
                          {t.is_active ? "사용" : "중지"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              등록된 템플릿이 없습니다. 아래에서 추가하세요.
              <div className="small dim" style={{ marginTop: 8 }}>
                템플릿은 점검할 항목을 적어둔 체크리스트 양식입니다.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>새 템플릿</h2>
        </div>
        <div className="card-body">
          <StateForm action={createTemplate} submitLabel="만들기">
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="name">
                  이름<span className="req">*</span>
                </label>
                <input type="text" id="name" name="name" maxLength={100} required />
                <div className="help">예: 월간 정기점검</div>
              </div>
              <div>
                <label className="lbl" htmlFor="site_id">
                  적용 사이트
                </label>
                <select id="site_id" name="site_id" defaultValue="">
                  <option value="">공통 (모든 사이트)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="help">특정 사이트 전용이면 선택하세요.</div>
              </div>
              <div className="full">
                <label className="lbl" htmlFor="description">
                  설명
                </label>
                <input
                  type="text"
                  id="description"
                  name="description"
                  maxLength={255}
                />
              </div>
            </div>
          </StateForm>
        </div>
      </div>
    </>
  );
}
