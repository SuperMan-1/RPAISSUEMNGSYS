import Link from "next/link";

import { SeverityBadge, StatusBadge } from "@/components/Badges";
import { requireProfile } from "@/lib/auth";
import { ISSUE_STATUSES, PAGE_SIZE, SEVERITIES } from "@/lib/constants";
import type { IssueStatus, Severity } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "이슈 · RPA 이슈관리" };

type IssueRow = {
  id: number;
  no: string;
  title: string;
  severity: Severity;
  status: IssueStatus;
  occurred_at: string;
  site: { name: string } | null;
  task: { name: string } | null;
  type: { name: string } | null;
  assignee: { name: string } | null;
  issue_tags: { tags: { name: string } | null }[];
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

/** PostgREST 의 or() 필터를 깨뜨리는 문자를 걷어낸다 */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()%*\\]/g, " ").trim();
}

export default async function IssuesPage({ searchParams }: PageProps<"/issues">) {
  await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;

  const f = {
    q: one(params.q),
    site_id: one(params.site_id),
    task_id: one(params.task_id),
    type_id: one(params.type_id),
    status: one(params.status),
    severity: one(params.severity),
    assignee_id: one(params.assignee_id),
    tag: one(params.tag),
    open_only: one(params.open_only),
  };
  const page = Math.max(1, Number(one(params.page)) || 1);

  // 필터 선택지
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

  const sites = sitesRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const types = typesRes.data ?? [];
  const users = usersRes.data ?? [];

  // 태그 필터는 먼저 해당 이슈 id 를 구한다
  let tagIssueIds: number[] | null = null;
  if (f.tag) {
    const { data } = await supabase
      .from("issue_tags")
      .select("issue_id, tags!inner(name)")
      .eq("tags.name", f.tag);
    tagIssueIds = (data ?? []).map((r) => r.issue_id);
  }

  let query = supabase
    .from("issues")
    .select(
      `id, no, title, severity, status, occurred_at,
       site:sites(name),
       task:tasks(name),
       type:issue_types(name),
       assignee:profiles!issues_assignee_id_fkey(name),
       issue_tags(tags(name))`,
      { count: "exact" },
    );

  const search = sanitizeSearch(f.q);
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,symptom.ilike.%${search}%,no.ilike.%${search}%`,
    );
  }
  if (f.site_id) query = query.eq("site_id", Number(f.site_id));
  if (f.task_id) query = query.eq("task_id", Number(f.task_id));
  if (f.type_id) query = query.eq("type_id", Number(f.type_id));
  if (f.status) query = query.eq("status", f.status as IssueStatus);
  if (f.severity) query = query.eq("severity", f.severity as Severity);
  if (f.assignee_id) query = query.eq("assignee_id", f.assignee_id);
  if (f.open_only) query = query.neq("status", "CLOSED");
  if (tagIssueIds) query = query.in("id", tagIssueIds.length > 0 ? tagIssueIds : [-1]);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const issues = (data ?? []) as unknown as IssueRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // 페이지 링크용 쿼리스트링 (page 제외)
  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) base.set(k, v);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(base);
    sp.set("page", String(p));
    return `/issues?${sp.toString()}`;
  };

  const filteredTasks = f.site_id
    ? tasks.filter((t) => String(t.site_id) === f.site_id)
    : tasks;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>이슈</h1>
          <p className="sub">전체 {total}건</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" href="/issues/new">
            + 이슈 등록
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form method="get" action="/issues">
            <div className="filters">
              <div className="wide">
                <label className="lbl" htmlFor="q">
                  검색어
                </label>
                <input
                  type="search"
                  id="q"
                  name="q"
                  defaultValue={f.q}
                  placeholder="제목·증상·이슈번호"
                />
              </div>

              <div>
                <label className="lbl" htmlFor="site_id">
                  사이트
                </label>
                <select id="site_id" name="site_id" defaultValue={f.site_id}>
                  <option value="">전체</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="task_id">
                  과제
                </label>
                <select id="task_id" name="task_id" defaultValue={f.task_id}>
                  <option value="">전체</option>
                  {filteredTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="type_id">
                  유형
                </label>
                <select id="type_id" name="type_id" defaultValue={f.type_id}>
                  <option value="">전체</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="status">
                  상태
                </label>
                <select id="status" name="status" defaultValue={f.status}>
                  <option value="">전체</option>
                  {Object.entries(ISSUE_STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="severity">
                  심각도
                </label>
                <select id="severity" name="severity" defaultValue={f.severity}>
                  <option value="">전체</option>
                  {Object.entries(SEVERITIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl" htmlFor="assignee_id">
                  담당자
                </label>
                <select id="assignee_id" name="assignee_id" defaultValue={f.assignee_id}>
                  <option value="">전체</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="lbl">&nbsp;</label>
                <label className="checkline">
                  <input
                    type="checkbox"
                    name="open_only"
                    value="1"
                    defaultChecked={Boolean(f.open_only)}
                  />
                  미종료만
                </label>
              </div>
            </div>

            {f.tag && <input type="hidden" name="tag" value={f.tag} />}

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">
                검색
              </button>
              <Link className="btn" href="/issues">
                초기화
              </Link>
              {f.tag && (
                <span className="small dim">
                  태그 필터: <span className="tag">#{f.tag}</span>
                </span>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body tight">
          {error ? (
            <div className="empty">목록을 불러오지 못했습니다. ({error.message})</div>
          ) : issues.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="nowrap">번호</th>
                      <th className="nowrap">발생일</th>
                      <th className="nowrap">사이트 · 과제</th>
                      <th>제목</th>
                      <th className="nowrap">유형</th>
                      <th className="nowrap">심각도</th>
                      <th className="nowrap">상태</th>
                      <th className="nowrap">담당자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((i) => (
                      <tr key={i.id}>
                        <td className="nowrap mono small">{i.no}</td>
                        <td className="nowrap small">{formatDate(i.occurred_at)}</td>
                        <td className="nowrap small">
                          {i.site?.name ?? "-"}
                          {i.task && (
                            <>
                              <br />
                              <span className="dim">› {i.task.name}</span>
                            </>
                          )}
                        </td>
                        <td>
                          <Link href={`/issues/${i.id}`}>{i.title}</Link>
                          {i.issue_tags.length > 0 && (
                            <div>
                              {i.issue_tags
                                .map((it) => it.tags?.name)
                                .filter((n): n is string => Boolean(n))
                                .map((name) => (
                                  <Link
                                    key={name}
                                    className="tag"
                                    href={`/issues?tag=${encodeURIComponent(name)}`}
                                  >
                                    #{name}
                                  </Link>
                                ))}
                            </div>
                          )}
                        </td>
                        <td className="nowrap small">{i.type?.name ?? "-"}</td>
                        <td className="nowrap">
                          <SeverityBadge severity={i.severity} />
                        </td>
                        <td className="nowrap">
                          <StatusBadge status={i.status} />
                        </td>
                        <td className="nowrap small">{i.assignee?.name ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pages > 1 && (
                <div className="pager">
                  {page > 1 ? (
                    <Link href={pageHref(page - 1)}>이전</Link>
                  ) : (
                    <span className="off">이전</span>
                  )}
                  {Array.from({ length: Math.min(5, pages) }, (_, idx) => {
                    const start = Math.max(1, Math.min(page - 2, pages - 4));
                    return start + idx;
                  })
                    .filter((p) => p >= 1 && p <= pages)
                    .map((p) =>
                      p === page ? (
                        <span key={p} className="cur">
                          {p}
                        </span>
                      ) : (
                        <Link key={p} href={pageHref(p)}>
                          {p}
                        </Link>
                      ),
                    )}
                  {page < pages ? (
                    <Link href={pageHref(page + 1)}>다음</Link>
                  ) : (
                    <span className="off">다음</span>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="empty">
              조건에 맞는 이슈가 없습니다.
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-primary btn-sm" href="/issues/new">
                  + 이슈 등록
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
