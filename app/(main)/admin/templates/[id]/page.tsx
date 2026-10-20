import Link from "next/link";
import { notFound } from "next/navigation";

import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StateForm } from "@/components/StateForm";
import { createClient } from "@/lib/supabase/server";

import {
  createItem,
  deleteItem,
  deleteTemplate,
  updateItem,
  updateTemplate,
} from "../../actions";

export const metadata = { title: "점검 템플릿 · RPA 이슈관리" };

export default async function AdminTemplateDetailPage({
  params,
  searchParams,
}: PageProps<"/admin/templates/[id]">) {
  const supabase = await createClient();

  const { id: rawId } = await params;
  const templateId = Number(rawId);
  if (!Number.isFinite(templateId)) notFound();

  const [templateRes, itemsRes, sitesRes, runCountRes] = await Promise.all([
    supabase
      .from("inspection_templates")
      .select("id, name, description, site_id, is_active")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("inspection_items")
      .select("id, seq, content, note")
      .eq("template_id", templateId)
      .order("seq")
      .order("id"),
    supabase
      .from("sites")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    supabase
      .from("inspection_runs")
      .select("id", { count: "exact", head: true })
      .eq("template_id", templateId),
  ]);

  const template = templateRes.data;
  if (!template) notFound();

  const items = itemsRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const runCount = runCountRes.count ?? 0;

  // 화면을 거치지 않고 삭제를 요청한 경우(버튼이 없어도 POST 는 보낼 수 있다)
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const blocked = pick(sp.blocked);
  const copyFailed = pick(sp.copyfailed);
  const nextSeq = items.length > 0 ? Math.max(...items.map((i) => i.seq)) + 10 : 10;

  return (
    <>
      {copyFailed && (
        <div className="flash flash-warn">
          템플릿은 만들어졌지만 점검 항목을 복사하지 못했습니다. 아래에서 직접 추가하세요.
        </div>
      )}

      {blocked && (
        <div className="flash flash-warn">
          이 템플릿으로 수행한 점검이 {blocked}건 있어 삭제하지 않았습니다. 지우면 과거
          점검 기록도 함께 사라집니다. 더 쓰지 않으시려면 &lsquo;사용&rsquo;을 해제하세요.
        </div>
      )}

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <Link className="btn btn-sm" href="/admin/templates">
          ← 템플릿 목록
        </Link>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>템플릿 정보</h2>
          <span className="hint">이 템플릿으로 수행한 점검 {runCount}건</span>
        </div>
        <div className="card-body">
          <StateForm
            action={updateTemplate}
            submitLabel="저장"
            footer={
              runCount > 0 ? (
                /* 점검 기록이 있으면 DB 가 삭제를 거부한다. 누를 수 있게 두고
                   실패를 보여주느니, 왜 안 되는지를 먼저 알려준다 */
                <span className="small dim" style={{ marginLeft: "auto", maxWidth: 420 }}>
                  이 템플릿으로 수행한 점검이 {runCount}건 있어 삭제할 수 없습니다. 지우면
                  과거 점검 기록도 함께 사라지기 때문입니다. 더 쓰지 않으시려면
                  위의 <strong>사용 여부</strong> 를 끄세요. 새 점검에서 선택되지 않습니다.
                </span>
              ) : (
                /* form 안에 form 을 넣으면 브라우저가 안쪽을 버려서, 이 버튼이
                   바깥 폼(저장)에 붙어 삭제 대신 저장이 실행된다.
                   바깥 폼에 이미 template_id 가 있으니 formAction 만 바꿔 준다 */
                <span style={{ marginLeft: "auto" }}>
                  <ConfirmSubmit
                    className="btn"
                    formAction={deleteTemplate}
                    message={`'${template.name}' 템플릿을 삭제합니다. 계속할까요?`}
                  >
                    템플릿 삭제
                  </ConfirmSubmit>
                </span>
              )
            }
          >
            <input type="hidden" name="template_id" value={template.id} />
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="name">
                  이름<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  defaultValue={template.name}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <label className="lbl" htmlFor="site_id">
                  적용 사이트
                </label>
                <select
                  id="site_id"
                  name="site_id"
                  defaultValue={template.site_id ? String(template.site_id) : ""}
                >
                  <option value="">공통 (모든 사이트)</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl">사용 여부</label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    name="is_active"
                    value="1"
                    defaultChecked={template.is_active}
                  />
                  사용
                </label>
              </div>
              <div className="full">
                <label className="lbl" htmlFor="description">
                  설명
                </label>
                <input
                  type="text"
                  id="description"
                  name="description"
                  defaultValue={template.description ?? ""}
                  maxLength={255}
                />
              </div>
            </div>
          </StateForm>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>점검 항목 {items.length}개</h2>
          <span className="hint">점검할 때 이 순서대로 나옵니다</span>
        </div>
        <div className="card-body tight">
          {items.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="nowrap" style={{ width: 80 }}>
                        순번
                      </th>
                      <th>점검 내용</th>
                      <th style={{ width: 220 }}>비고</th>
                      <th className="nowrap" style={{ width: 130 }}>
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <form action={updateItem}>
                            <input type="hidden" name="item_id" value={item.id} />
                            <input
                              type="hidden"
                              name="template_id"
                              value={template.id}
                            />
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
                                type="number"
                                name="seq"
                                defaultValue={item.seq}
                                style={{ width: 70 }}
                              />
                              <input
                                type="text"
                                name="content"
                                defaultValue={item.content}
                                maxLength={300}
                                required
                                style={{ flex: 1, minWidth: 220 }}
                              />
                              <input
                                type="text"
                                name="note"
                                defaultValue={item.note ?? ""}
                                maxLength={300}
                                placeholder="판정 기준 등"
                                style={{ width: 200 }}
                              />
                              <button type="submit" className="btn btn-sm">
                                저장
                              </button>
                              <ConfirmSubmit
                                formAction={deleteItem}
                                message="이 점검 항목을 삭제할까요?"
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
              </div>
              <div className="small dim" style={{ padding: "0 12px 12px" }}>
                항목을 고치거나 지워도 <strong>지난 점검 기록은 그대로 남습니다.</strong>{" "}
                점검할 때 그 시점의 항목 문구를 복사해 저장하기 때문입니다.
              </div>
            </>
          ) : (
            <div className="empty">
              점검 항목이 없습니다. 아래에서 추가하세요.
              <div className="small dim" style={{ marginTop: 8 }}>
                항목이 하나도 없으면 이 템플릿으로 점검을 시작할 수 없습니다.
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>새 항목</h2>
        </div>
        <div className="card-body">
          <StateForm action={createItem} submitLabel="추가">
            <input type="hidden" name="template_id" value={template.id} />
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="seq">
                  순번
                </label>
                <input type="number" id="seq" name="seq" defaultValue={nextSeq} />
                <div className="help">10 단위로 띄우면 나중에 끼워 넣기 쉽습니다.</div>
              </div>
              <div className="full">
                <label className="lbl" htmlFor="content">
                  점검 내용<span className="req">*</span>
                </label>
                <input
                  type="text"
                  id="content"
                  name="content"
                  maxLength={300}
                  required
                  placeholder="예) 전월 실행 건 중 실패 건이 있는지 확인"
                />
              </div>
              <div className="full">
                <label className="lbl" htmlFor="note">
                  비고
                </label>
                <input
                  type="text"
                  id="note"
                  name="note"
                  maxLength={300}
                  placeholder="예) 실패 건이 있으면 이상으로 처리"
                />
              </div>
            </div>
          </StateForm>
        </div>
      </div>
    </>
  );
}
