import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StateForm } from "@/components/StateForm";
import { createClient } from "@/lib/supabase/server";

import { createIssueType, deleteIssueType, updateIssueType } from "../actions";

export const metadata = { title: "이슈 유형 관리 · RPA 이슈관리" };

export default async function AdminTypesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("issue_types")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");

  const types = data ?? [];

  // 유형별 이슈 건수 (삭제 가능 여부를 가늠할 수 있게)
  const { data: issueTypeRows } = await supabase.from("issues").select("type_id");
  const counts = new Map<number, number>();
  for (const row of issueTypeRows ?? []) {
    if (row.type_id) counts.set(row.type_id, (counts.get(row.type_id) ?? 0) + 1);
  }

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>이슈 유형 {types.length}개</h2>
          <span className="hint">이슈 등록 화면의 유형 선택지</span>
        </div>
        <div className="card-body tight">
          {types.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>이름</th>
                      <th className="nowrap" style={{ width: 90 }}>
                        정렬
                      </th>
                      <th className="nowrap" style={{ width: 70 }}>
                        사용
                      </th>
                      <th className="nowrap" style={{ width: 90 }}>
                        이슈
                      </th>
                      <th className="nowrap" style={{ width: 130 }}>
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((t) => (
                      <tr key={t.id}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <form action={updateIssueType}>
                            <input type="hidden" name="type_id" value={t.id} />
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
                                name="name"
                                defaultValue={t.name}
                                maxLength={50}
                                required
                                style={{ flex: 1, minWidth: 200 }}
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
                              <span className="small dim" style={{ width: 70 }}>
                                {counts.get(t.id) ?? 0}건
                              </span>
                              <button type="submit" className="btn btn-sm">
                                저장
                              </button>
                              <ConfirmSubmit
                                formAction={deleteIssueType}
                                message={`유형 '${t.name}' 을(를) 삭제할까요?`}
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
                이미 이슈에서 쓰고 있는 유형은 삭제할 수 없습니다. 그럴 땐
                &lsquo;사용&rsquo;을 해제해 새 이슈에서만 안 보이게 하세요. 과거 이슈의
                유형 표시는 그대로 남습니다.
              </div>
            </>
          ) : (
            <div className="empty">등록된 유형이 없습니다. 아래에서 추가하세요.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>새 유형</h2>
        </div>
        <div className="card-body">
          <StateForm action={createIssueType} submitLabel="추가">
            <div className="form-grid">
              <div>
                <label className="lbl" htmlFor="name">
                  이름<span className="req">*</span>
                </label>
                <input type="text" id="name" name="name" maxLength={50} required />
                <div className="help">예: 데이터 오류</div>
              </div>
              <div>
                <label className="lbl" htmlFor="sort_order">
                  정렬 순서
                </label>
                <input type="number" id="sort_order" name="sort_order" defaultValue={0} />
              </div>
            </div>
          </StateForm>
        </div>
      </div>
    </>
  );
}
