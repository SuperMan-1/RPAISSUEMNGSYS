import Link from "next/link";

import { requireProfile } from "@/lib/auth";
import { PAGE_SIZE, RUN_STATUSES } from "@/lib/constants";
import type { RunStatus } from "@/lib/database.types";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "정기점검 · RPA 이슈관리" };

type RunRow = {
  id: number;
  inspected_at: string;
  status: RunStatus;
  template: { name: string } | null;
  site: { name: string } | null;
  task: { name: string } | null;
  inspector: { name: string } | null;
  inspection_results: { result: string }[];
};

function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function InspectionsPage({
  searchParams,
}: PageProps<"/inspections">) {
  await requireProfile();
  const supabase = await createClient();
  const params = await searchParams;

  const f = {
    site_id: one(params.site_id),
    template_id: one(params.template_id),
    status: one(params.status),
    from: one(params.from),
    to: one(params.to),
  };
  const page = Math.max(1, Number(one(params.page)) || 1);

  const [sitesRes, templatesRes] = await Promise.all([
    supabase.from("sites").select("id, name").order("sort_order").order("name"),
    supabase.from("inspection_templates").select("id, name").order("name"),
  ]);

  let query = supabase
    .from("inspection_runs")
    .select(
      `id, inspected_at, status,
       template:inspection_templates(name),
       site:sites(name),
       task:tasks(name),
       inspector:profiles(name),
       inspection_results(result)`,
      { count: "exact" },
    );

  if (f.site_id) query = query.eq("site_id", Number(f.site_id));
  if (f.template_id) query = query.eq("template_id", Number(f.template_id));
  if (f.status) query = query.eq("status", f.status as RunStatus);
  if (f.from) query = query.gte("inspected_at", `${f.from}T00:00:00+09:00`);
  if (f.to) query = query.lte("inspected_at", `${f.to}T23:59:59+09:00`);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await query
    .order("inspected_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const runs = (data ?? []) as unknown as RunRow[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const base = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) base.set(k, v);
  const pageHref = (p: number) => {
    const sp = new URLSearchParams(base);
    sp.set("page", String(p));
    return `/inspections?${sp.toString()}`;
  };

  // 점검을 완료하고 넘어온 경우. 이상인데 이슈로 등록하지 않은 항목이 있으면
  // 여기서 짚어준다. 점검표에만 '이상'으로 남으면 아무도 다시 보지 않는다.
  const completedId = one(params.completed);
  const pendingNg = Number(one(params.pending)) || 0;
  const totalNg = Number(one(params.ng)) || 0;

  return (
    <main className="page">
      {completedId && (
        <div className={pendingNg > 0 ? "flash flash-warn" : "flash flash-ok"}>
          점검을 완료했습니다.
          {pendingNg > 0 ? (
            <>
              {" "}
              이상 {totalNg}건 가운데 <strong>{pendingNg}건이 아직 이슈로 등록되지
              않았습니다.</strong> 이대로 두면 추적되지 않습니다.{" "}
              <Link href={`/inspections/${completedId}`}>점검으로 돌아가 전환하기</Link>
            </>
          ) : (
            <>
              {totalNg > 0
                ? ` 이상 ${totalNg}건은 모두 이슈로 등록돼 있습니다.`
                : " 이상 항목은 없었습니다."}{" "}
              <Link href={`/inspections/${completedId}`}>점검 보기</Link>
            </>
          )}
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>정기점검</h1>
          <p className="sub">전체 {total}건</p>
        </div>
        <div className="page-actions">
          <Link className="btn btn-primary" href="/inspections/new">
            + 점검 수행
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form method="get" action="/inspections">
            <div className="filters">
              <div>
                <label className="lbl" htmlFor="site_id">
                  사이트
                </label>
                <select id="site_id" name="site_id" defaultValue={f.site_id}>
                  <option value="">전체</option>
                  {(sitesRes.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="template_id">
                  템플릿
                </label>
                <select id="template_id" name="template_id" defaultValue={f.template_id}>
                  <option value="">전체</option>
                  {(templatesRes.data ?? []).map((t) => (
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
                  {Object.entries(RUN_STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="lbl" htmlFor="from">
                  점검일 (시작)
                </label>
                <input type="date" id="from" name="from" defaultValue={f.from} />
              </div>
              <div>
                <label className="lbl" htmlFor="to">
                  점검일 (끝)
                </label>
                <input type="date" id="to" name="to" defaultValue={f.to} />
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary">
                검색
              </button>
              <Link className="btn" href="/inspections">
                초기화
              </Link>
            </div>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-body tight">
          {runs.length > 0 ? (
            <>
              <div className="table-scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="nowrap">점검일</th>
                      <th className="nowrap">사이트 · 과제</th>
                      <th>템플릿</th>
                      <th className="nowrap">항목</th>
                      <th className="nowrap">이상</th>
                      <th className="nowrap">상태</th>
                      <th className="nowrap">점검자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const items = r.inspection_results ?? [];
                      const ng = items.filter((x) => x.result === "NG").length;
                      return (
                        <tr key={r.id}>
                          <td className="nowrap small">
                            <Link href={`/inspections/${r.id}`}>
                              {formatDate(r.inspected_at)}
                            </Link>
                          </td>
                          <td className="nowrap small">
                            {r.site?.name ?? "-"}
                            {r.task && (
                              <>
                                <br />
                                <span className="dim">› {r.task.name}</span>
                              </>
                            )}
                          </td>
                          <td>
                            <Link href={`/inspections/${r.id}`}>
                              {r.template?.name ?? "-"}
                            </Link>
                          </td>
                          <td className="nowrap small">{items.length}개</td>
                          <td className="nowrap">
                            {ng > 0 ? (
                              <span className="badge badge-danger">{ng}건</span>
                            ) : (
                              <span className="dim small">-</span>
                            )}
                          </td>
                          <td className="nowrap">
                            <span
                              className={`badge ${
                                r.status === "DONE" ? "badge-ok" : "badge-warn"
                              }`}
                            >
                              {RUN_STATUSES[r.status]}
                            </span>
                          </td>
                          <td className="nowrap small">{r.inspector?.name ?? "-"}</td>
                        </tr>
                      );
                    })}
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
                  <span className="cur">{page}</span>
                  <span className="off">/ {pages}</span>
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
              점검 기록이 없습니다.
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-primary btn-sm" href="/inspections/new">
                  + 점검 수행
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
