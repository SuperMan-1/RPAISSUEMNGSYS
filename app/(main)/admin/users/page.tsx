import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { StateForm } from "@/components/StateForm";
import { USERNAME_HELP, USERNAME_PATTERN } from "@/lib/account";
import { requireAdmin } from "@/lib/auth";
import { USER_ROLES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { hasSupabaseSecretKey } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

import { approveUser, createUser, rejectUser, resetUserPassword, updateUser } from "../actions";

export const metadata = { title: "사용자 관리 · RPA 이슈관리" };

export default async function AdminUsersPage() {
  const me = await requireAdmin();
  const supabase = await createClient();

  const canManageAccounts = hasSupabaseSecretKey();

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username, name, email, company, dept, phone, role, is_active, created_at")
    .order("created_at");

  const all = profiles ?? [];
  const pending = all.filter((u) => !u.is_active);
  const users = [...all].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <>
      {pending.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>승인 대기 {pending.length}명</h2>
            <span className="hint">가입 신청한 사람입니다. 승인해야 로그인할 수 있습니다</span>
          </div>
          <div className="card-body tight">
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>아이디</th>
                    <th style={{ width: 110 }}>이름</th>
                    <th>이메일</th>
                    <th style={{ width: 190 }}>회사 · 부서</th>
                    <th className="nowrap" style={{ width: 130 }}>
                      휴대전화
                    </th>
                    <th className="nowrap" style={{ width: 110 }}>
                      신청일
                    </th>
                    <th className="nowrap" style={{ width: 130 }}>
                      &nbsp;
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((u) => (
                    <tr key={u.id}>
                      <td className="mono">{u.username}</td>
                      <td>{u.name}</td>
                      <td className="small">{u.email ?? "-"}</td>
                      <td className="small">
                        {[u.company, u.dept].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td className="small nowrap">{u.phone ?? "-"}</td>
                      <td className="small dim nowrap">{formatDate(u.created_at)}</td>
                      <td>
                        <form action={approveUser} className="btn-row">
                          <input type="hidden" name="user_id" value={u.id} />
                          <button type="submit" className="btn btn-sm btn-primary">
                            승인
                          </button>
                          {canManageAccounts && (
                            <ConfirmSubmit
                              formAction={rejectUser}
                              message={`${u.name} 님의 가입 신청을 거절하고 계정을 지웁니다. 계속할까요?`}
                            >
                              거절
                            </ConfirmSubmit>
                          )}
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>사용자 {users.length}명</h2>
          <span className="hint">이름·역할·사용 여부를 바꾸고 저장하세요</span>
        </div>
        <div className="card-body tight">
          {users.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>아이디</th>
                      <th style={{ width: 170 }}>이름</th>
                      <th>이메일 · 소속</th>
                      <th className="nowrap" style={{ width: 120 }}>
                        역할
                      </th>
                      <th className="nowrap" style={{ width: 80 }}>
                        사용
                      </th>
                      <th className="nowrap" style={{ width: 110 }}>
                        등록일
                      </th>
                      <th className="nowrap" style={{ width: 80 }}>
                        &nbsp;
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isMe = u.id === me.id;
                      const affiliation = [u.company, u.dept, u.phone].filter(Boolean).join(" · ");
                      return (
                        <tr key={u.id}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <form action={updateUser}>
                              <input type="hidden" name="user_id" value={u.id} />
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                  padding: "8px 12px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span className="mono small" style={{ width: 100 }}>
                                  {u.username}
                                </span>
                                <input
                                  type="text"
                                  name="name"
                                  defaultValue={u.name}
                                  maxLength={50}
                                  required
                                  style={{ width: 160 }}
                                />
                                <span className="small dim" style={{ flex: 1, minWidth: 180 }}>
                                  {u.email ?? "-"}
                                  {affiliation && ` · ${affiliation}`}
                                  {isMe && " · 본인"}
                                </span>
                                <select
                                  name="role"
                                  defaultValue={u.role}
                                  disabled={isMe}
                                  style={{ width: 110 }}
                                >
                                  {Object.entries(USER_ROLES).map(([k, v]) => (
                                    <option key={k} value={k}>
                                      {v}
                                    </option>
                                  ))}
                                </select>
                                {/* disabled 인 select 는 전송되지 않으므로 본인 값은 따로 넣는다 */}
                                {isMe && <input type="hidden" name="role" value={u.role} />}
                                <label className="checkline">
                                  <input
                                    type="checkbox"
                                    name="is_active"
                                    value="1"
                                    defaultChecked={u.is_active}
                                    disabled={isMe}
                                  />
                                  사용
                                </label>
                                {isMe && <input type="hidden" name="is_active" value="1" />}
                                <span className="small dim" style={{ width: 100 }}>
                                  {formatDate(u.created_at)}
                                </span>
                                <button type="submit" className="btn btn-sm">
                                  저장
                                </button>
                              </div>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="small dim" style={{ padding: "0 12px 12px" }}>
                사용자는 삭제하지 않습니다. 이슈와 처리 이력에 작성자로 남아 있어야 하기
                때문입니다. 더 이상 쓰지 않는 계정은 &lsquo;사용&rsquo;을 해제하면 로그인이
                막힙니다. 아이디와 이메일은 로그인에 쓰이므로 여기서 바꾸지 않습니다. 본인
                계정의 역할과 사용 여부는 스스로 바꿀 수 없습니다.
              </div>
            </>
          ) : (
            <div className="empty">등록된 사용자가 없습니다.</div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>새 사용자</h2>
          <span className="hint">계정을 만들고 비밀번호를 전달하세요</span>
        </div>
        <div className="card-body">
          {canManageAccounts ? (
            <StateForm action={createUser} submitLabel="계정 만들기">
              <div className="form-grid">
                <div>
                  <label className="lbl" htmlFor="username">
                    아이디<span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    pattern={USERNAME_PATTERN}
                    minLength={4}
                    maxLength={20}
                    required
                  />
                  <div className="help">로그인 아이디. {USERNAME_HELP}</div>
                </div>
                <div>
                  <label className="lbl" htmlFor="user_name">
                    이름<span className="req">*</span>
                  </label>
                  <input type="text" id="user_name" name="name" maxLength={50} required />
                </div>
                <div>
                  <label className="lbl" htmlFor="email">
                    이메일<span className="req">*</span>
                  </label>
                  <input type="email" id="email" name="email" maxLength={100} required />
                  <div className="help">한 이메일로는 계정 하나만 만들 수 있습니다.</div>
                </div>
                <div>
                  <label className="lbl" htmlFor="password">
                    초기 비밀번호<span className="req">*</span>
                  </label>
                  <input
                    type="text"
                    id="password"
                    name="password"
                    minLength={8}
                    required
                    autoComplete="off"
                  />
                  <div className="help">8자 이상. 전달한 뒤 본인이 바꾸게 하세요.</div>
                </div>
                <div>
                  <label className="lbl" htmlFor="role">
                    역할
                  </label>
                  <select id="role" name="role" defaultValue="USER">
                    {Object.entries(USER_ROLES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl" htmlFor="company">
                    회사
                  </label>
                  <input type="text" id="company" name="company" maxLength={50} />
                </div>
                <div>
                  <label className="lbl" htmlFor="dept">
                    부서
                  </label>
                  <input type="text" id="dept" name="dept" maxLength={50} />
                </div>
                <div>
                  <label className="lbl" htmlFor="phone">
                    휴대전화
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    maxLength={20}
                    placeholder="010-1234-5678"
                  />
                </div>
              </div>
              <div className="help" style={{ marginTop: 10 }}>
                여기서 만든 계정은 바로 로그인할 수 있습니다. 가입 화면으로 들어온 신청은
                위의 &lsquo;승인 대기&rsquo; 에서 승인해야 합니다.
              </div>
            </StateForm>
          ) : (
            <div className="flash flash-warn mb0">
              <code>SUPABASE_SECRET_KEY</code> 가 설정되지 않아 여기서는 계정을 만들 수
              없습니다. <code>.env.local</code> 에 키를 넣거나, Supabase 대시보드 →
              Authentication → Users 에서 직접 만드세요.
            </div>
          )}
        </div>
      </div>

      {canManageAccounts && users.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>비밀번호 재설정</h2>
            <span className="hint">비밀번호를 잊은 사용자가 있을 때</span>
          </div>
          <div className="card-body">
            <StateForm action={resetUserPassword} submitLabel="비밀번호 변경">
              <div className="form-grid">
                <div>
                  <label className="lbl" htmlFor="reset_user">
                    대상
                  </label>
                  <select id="reset_user" name="user_id" required>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.username})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="lbl" htmlFor="new_password">
                    새 비밀번호
                  </label>
                  <input
                    type="text"
                    id="new_password"
                    name="password"
                    minLength={8}
                    required
                    autoComplete="off"
                  />
                  <div className="help">8자 이상</div>
                </div>
              </div>
            </StateForm>
          </div>
        </div>
      )}
    </>
  );
}
