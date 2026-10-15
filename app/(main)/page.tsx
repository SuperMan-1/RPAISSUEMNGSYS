import Link from "next/link";

import { SeverityBadge, StatusBadge } from "@/components/Badges";
import { requireProfile } from "@/lib/auth";
import { RUN_STATUSES } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "대시보드 · RPA 이슈관리" };

type RecentIssue = {
  id: number;
  no: string;
  title: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  status: "RECEIVED" | "IN_PROGRESS" | "ACTION_DONE" | "CLOSED" | "ON_HOLD";
  occurred_at: string;
  site: { name: string } | null;
  task: { name: string } | null;
};

type RecentRun = {
  id: number;
  inspected_at: string;
  status: "IN_PROGRESS" | "DONE";
  template: { name: string } | null;
  site: { name: string } | null;
  inspector: { name: string } | null;
  inspection_results: { result: string }[];
};

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // 이번 달 1일 00:00 (한국시간) 부터
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 60 * 60 * 1000,
  ).toISOString();

  const [openCount, mineCount, highCount, totalCount, recent] = await Promise.all([
    supabase.from("issues").select("id", { count: "exact", head: true }).neq("status", "CLOSED"),
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .neq("status", "CLOSED")
      .eq("assignee_id", profile.id),
    supabase
      .from("issues")
      .select("id", { count: "exact", head: true })
      .neq("status", "CLOSED")
      .eq("severity", "HIGH"),
    supabase.from("issues").select("id", { count: "exact", head: true }),
    supabase
      .from("issues")
      .select("id, no, title, severity, status, occurred_at, site:sites(name), task:tasks(name)")
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(8),
  ]);

  const recentIssues = (recent.data ?? []) as unknown as RecentIssue[];

  // 정기점검 현황
  const [monthRuns, openRuns, pendingNg, recentRuns] = await Promise.all([
    supabase
      .from("inspection_runs")
      .select("id", { count: "exact", head: true })
      .gte("inspected_at", monthStart),
    supabase
      .from("inspection_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "IN_PROGRESS"),
    // 이상으로 표시했지만 아직 이슈로 전환하지 않은 항목
    supabase
      .from("inspection_results")
      .select("id", { count: "exact", head: true })
      .eq("result", "NG")
      .is("issue_id", null),
    supabase
      .from("inspection_runs")
      .select(
        `id, inspected_at, status,
         template:inspection_templates(name),
         site:sites(name),
         inspector:profiles(name),
         inspection_results(result)`,
      )
      .order("inspected_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5),
  ]);

  const recentRunRows = (recentRuns.data ?? []) as unknown as RecentRun[];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p className="sub">{profile.name}님, 오늘도 수고하십니다.</p>
        </div>
        <div className="page-actions">
          <Link className="btn" href="/inspections/new">
            + 점검 수행
          </Link>
          <Link className="btn btn-primary" href="/issues/new">
            + 이슈 등록
          </Link>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="n">{openCount.count ?? 0}</div>
          <div className="l">미종료 이슈</div>
        </div>
        <div className="stat">
          <div className="n">{mineCount.count ?? 0}</div>
          <div className="l">내 담당 (미종료)</div>
        </div>
        <div className="stat">
          <div className="n">{highCount.count ?? 0}</div>
          <div className="l">심각도 높음 (미종료)</div>
        </div>
        <div className="stat">
          <div className="n">{totalCount.count ?? 0}</div>
          <div className="l">전체 누적 이슈</div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>정기점검 현황</h2>
          <Link className="small" href="/inspections">
            전체 보기 →
          </Link>
        </div>
        <div className="card-body">
          <div className="stats" style={{ marginBottom: 0 }}>
            <div className="stat">
              <div className="n">{monthRuns.count ?? 0}</div>
              <div className="l">이번 달 점검</div>
            </div>
            <div className="stat">
              <div className="n">{openRuns.count ?? 0}</div>
              <div className="l">진행중 점검</div>
            </div>
            <div className="stat">
              <div className="n" style={{ color: (pendingNg.count ?? 0) > 0 ? "var(--danger)" : undefined }}>
                {pendingNg.count ?? 0}
              </div>
              <div className="l">이슈 미전환 이상</div>
            </div>
          </div>

          {(pendingNg.count ?? 0) > 0 && (
            <p className="small dim" style={{ marginBottom: 0, marginTop: 12 }}>
              이상으로 표시했지만 아직 이슈로 만들지 않은 점검 항목이 있습니다.
              점검 상세에서 &lsquo;이슈로 전환&rsquo;을 눌러 처리 이력을 남기세요.
            </p>
          )}
        </div>

        <div className="card-body tight" style={{ borderTop: "1px solid var(--border)" }}>
          {recentRunRows.length > 0 ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap">점검일</th>
                    <th className="nowrap">사이트</th>
                    <th>템플릿</th>
                    <th className="nowrap">이상</th>
                    <th className="nowrap">상태</th>
                    <th className="nowrap">점검자</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRunRows.map((r) => {
                    const ng = (r.inspection_results ?? []).filter(
                      (x) => x.result === "NG",
                    ).length;
                    return (
                      <tr key={r.id}>
                        <td className="nowrap small">
                          <Link href={`/inspections/${r.id}`}>
                            {formatDate(r.inspected_at)}
                          </Link>
                        </td>
                        <td className="nowrap small">{r.site?.name ?? "-"}</td>
                        <td>
                          <Link href={`/inspections/${r.id}`}>
                            {r.template?.name ?? "-"}
                          </Link>
                        </td>
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
          ) : (
            <div className="empty">
              점검 기록이 없습니다.
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-sm" href="/inspections/new">
                  + 점검 수행
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>최근 등록된 이슈</h2>
          <Link className="small" href="/issues">
            전체 보기 →
          </Link>
        </div>
        <div className="card-body tight">
          {recentIssues.length > 0 ? (
            <div className="table-scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th className="nowrap">번호</th>
                    <th className="nowrap">발생일</th>
                    <th className="nowrap">사이트 · 과제</th>
                    <th>제목</th>
                    <th className="nowrap">심각도</th>
                    <th className="nowrap">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {recentIssues.map((i) => (
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
                      </td>
                      <td className="nowrap">
                        <SeverityBadge severity={i.severity} />
                      </td>
                      <td className="nowrap">
                        <StatusBadge status={i.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              아직 등록된 이슈가 없습니다.
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-primary btn-sm" href="/issues/new">
                  + 첫 이슈 등록
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
