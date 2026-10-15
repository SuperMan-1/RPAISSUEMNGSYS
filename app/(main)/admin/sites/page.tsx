import Link from "next/link";

import { StateForm } from "@/components/StateForm";
import { createClient } from "@/lib/supabase/server";

import { createSite } from "../actions";

export const metadata = { title: "사이트 관리 · RPA 이슈관리" };

type SiteRow = {
  id: number;
  code: string;
  name: string;
  note: string | null;
  is_active: boolean;
  sort_order: number;
  tasks: { count: number }[];
};

export default async function AdminSitesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("sites")
    .select("id, code, name, note, is_active, sort_order, tasks(count)")
    .order("sort_order")
    .order("name");

  const sites = (data ?? []) as unknown as SiteRow[];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>사이트 목록</h2>
          <span className="hint">사이트를 눌러 과제를 관리합니다</span>
        </div>
        <div className="card-body tight">
          {sites.length > 0 ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap">코드</th>
                    <th>이름</th>
                    <th className="nowrap">과제</th>
                    <th>비고</th>
                    <th className="nowrap">정렬</th>
                    <th className="nowrap">사용</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((s) => (
                    <tr key={s.id}>
                      <td className="nowrap mono small">{s.code}</td>
                      <td>
                        <Link href={`/admin/sites/${s.id}`}>{s.name}</Link>
                      </td>
                      <td className="nowrap small">{s.tasks?.[0]?.count ?? 0}개</td>
                      <td className="small dim">{s.note ?? ""}</td>
                      <td className="nowrap small">{s.sort_order}</td>
                      <td className="nowrap">
                        <span className={`badge ${s.is_active ? "badge-ok" : "badge-neutral"}`}>
                          {s.is_active ? "사용" : "중지"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              등록된 사이트가 없습니다. 아래에서 첫 사이트를 등록하세요.
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>새 사이트</h2>
        </div>
        <div className="card-body">
          <StateForm action={createSite} submitLabel="등록">
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="code">
                  코드<span className="req">*</span>
                </label>
                <input type="text" id="code" name="code" maxLength={30} required />
                <div className="help">짧은 영문·숫자 (예: AAA)</div>
              </div>
              <div>
                <label className="lbl" htmlFor="name">
                  이름<span className="req">*</span>
                </label>
                <input type="text" id="name" name="name" maxLength={100} required />
                <div className="help">화면에 보이는 이름 (예: A공사)</div>
              </div>
              <div>
                <label className="lbl" htmlFor="sort_order">
                  정렬 순서
                </label>
                <input type="number" id="sort_order" name="sort_order" defaultValue={0} />
              </div>
              <div className="full">
                <label className="lbl" htmlFor="note">
                  비고
                </label>
                <input type="text" id="note" name="note" maxLength={255} />
              </div>
            </div>
          </StateForm>
        </div>
      </div>
    </>
  );
}
