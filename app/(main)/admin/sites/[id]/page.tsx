import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StateForm } from "@/components/StateForm";
import { createClient } from "@/lib/supabase/server";

import { createTask, deleteSite, deleteTask, updateSite, updateTask } from "../../actions";

export const metadata = { title: "사이트 상세 · RPA 이슈관리" };

export default async function AdminSiteDetailPage({
  params,
}: PageProps<"/admin/sites/[id]">) {
  const supabase = await createClient();

  const { id: rawId } = await params;
  const siteId = Number(rawId);
  if (!Number.isFinite(siteId)) notFound();

  const [siteRes, tasksRes, issueCountRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id, code, name, note, is_active, sort_order")
      .eq("id", siteId)
      .maybeSingle(),
    supabase
      .from("tasks")
      .select("id, code, name, note, is_active, sort_order")
      .eq("site_id", siteId)
      .order("sort_order")
      .order("name"),
    supabase.from("issues").select("id", { count: "exact", head: true }).eq("site_id", siteId),
  ]);

  const site = siteRes.data;
  if (!site) notFound();

  const tasks = tasksRes.data ?? [];
  const issueCount = issueCountRes.count ?? 0;

  return (
    <>
      <div className="btn-row" style={{ marginBottom: 12 }}>
        <Link className="btn btn-sm" href="/admin/sites">
          ← 사이트 목록
        </Link>
      </div>

      {/* 사이트 정보 */}
      <div className="card">
        <div className="card-head">
          <h2>사이트 정보</h2>
          <span className="hint">이 사이트의 이슈 {issueCount}건</span>
        </div>
        <div className="card-body">
          <StateForm
            action={updateSite}
            submitLabel="저장"
            footer={
              /* form 중첩은 브라우저가 안쪽을 버린다. 바깥 폼에 site_id 가
                 이미 있으므로 formAction 으로 보낼 곳만 바꾼다 */
              <span style={{ marginLeft: "auto" }}>
                <ConfirmSubmit
                  className="btn"
                  formAction={deleteSite}
                  message={`${site.name} 사이트를 삭제합니다. 계속할까요?`}
                >
                  사이트 삭제
                </ConfirmSubmit>
              </span>
            }
          >
            <input type="hidden" name="site_id" value={site.id} />
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="code">
                  코드<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  defaultValue={site.code}
                  maxLength={30}
                  required
                />
              </div>
              <div>
                <label className="lbl" htmlFor="name">
                  이름<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={site.name}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="lbl" htmlFor="sort_order">
                  정렬 순서
                </label>
                <input
                  type="number"
                  id="sort_order"
                  name="sort_order"
                  defaultValue={site.sort_order}
                />
              </div>
              <div>
                <label className="lbl">사용 여부</label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    name="is_active"
                    value="1"
                    defaultChecked={site.is_active}
                  />
                  사용
                </label>
                <div className="help">해제하면 이슈 등록 화면에서 숨겨집니다.</div>
              </div>
              <div className="full">
                <label className="lbl" htmlFor="note">
                  비고
                </label>
                <input
                  type="text"
                  id="note"
                  name="note"
                  defaultValue={site.note ?? ""}
                  maxLength={255}
                />
              </div>
            </div>
          </StateForm>
        </div>
      </div>

      {/* 과제 목록 */}
      <div className="card">
        <div className="card-head">
          <h2>과제 {tasks.length}개</h2>
          <span className="hint">이 사이트에서 돌아가는 RPA 업무</span>
        </div>
        <div className="card-body tight">
          {tasks.length > 0 ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap" style={{ width: 140 }}>
                      코드
                    </th>
                    <th>이름</th>
                    <th className="nowrap" style={{ width: 90 }}>
                      정렬
                    </th>
                    <th className="nowrap" style={{ width: 70 }}>
                      사용
                    </th>
                    <th className="nowrap" style={{ width: 130 }}>
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <form action={updateTask}>
                          <input type="hidden" name="task_id" value={t.id} />
                          <input type="hidden" name="site_id" value={site.id} />
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                              padding: "8px 12px",
                              flexWrap: "wrap",
                            }}
                          >
                            <input
                              type="text"
                              name="code"
                              defaultValue={t.code}
                              maxLength={30}
                              required
                              style={{ width: 130 }}
                            />
                            <input
                              type="text"
                              name="name"
                              defaultValue={t.name}
                              maxLength={100}
                              required
                              style={{ flex: 1, minWidth: 180 }}
                            />
                            <input
                              type="number"
                              name="sort_order"
                              defaultValue={t.sort_order}
                              style={{ width: 80 }}
                            />
                            <label className="checkline">
                              <input
                                type="checkbox"
                                name="is_active"
                                value="1"
                                defaultChecked={t.is_active}
                              />
                              사용
                            </label>
                            <button type="submit" className="btn btn-sm">
                              저장
                            </button>
                            <ConfirmSubmit
                              formAction={deleteTask}
                              message={`과제 '${t.name}' 을(를) 삭제할까요?`}
                            >
                              삭제
                            </ConfirmSubmit>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="small dim" style={{ padding: "0 12px 12px" }}>
                이슈에서 쓰고 있는 과제는 삭제할 수 없습니다. 그럴 땐
                &lsquo;사용&rsquo;을 해제해 목록에서 숨기세요.
              </div>
            </div>
          ) : (
            <div className="empty">
              등록된 과제가 없습니다. 아래에서 추가하세요.
              <div className="small dim" style={{ marginTop: 8 }}>
                과제를 안 만들어도 이슈는 등록할 수 있습니다. 사이트만 고르면 됩니다.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 새 과제 */}
      <div className="card">
        <div className="card-head">
          <h2>새 과제</h2>
        </div>
        <div className="card-body">
          <StateForm action={createTask} submitLabel="추가">
            <input type="hidden" name="site_id" value={site.id} />
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="task_code">
                  코드<span className="req">*</span>
                </label>
                <input type="text" id="task_code" name="code" maxLength={30} required />
                <div className="help">사이트 안에서만 고유하면 됩니다 (예: TAX)</div>
              </div>
              <div>
                <label className="lbl" htmlFor="task_name">
                  이름<span className="req">*</span>
                </label>
                <input type="text" id="task_name" name="name" maxLength={100} required />
                <div className="help">예: 세금계산서 자동등록</div>
              </div>
              <div>
                <label className="lbl" htmlFor="task_sort">
                  정렬 순서
                </label>
                <input type="number" id="task_sort" name="sort_order" defaultValue={0} />
              </div>
              <div className="full">
                <label className="lbl" htmlFor="task_note">
                  비고
                </label>
                <input type="text" id="task_note" name="note" maxLength={255} />
              </div>
            </div>
          </StateForm>
        </div>
      </div>
    </>
  );
}
