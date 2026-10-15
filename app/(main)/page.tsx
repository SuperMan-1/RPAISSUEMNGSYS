import Link from "next/link";

import { SeverityBadge, StatusBadge } from "@/components/Badges";
import { requireProfile } from "@/lib/auth";
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

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

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

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p className="sub">{profile.name}님, 오늘도 수고하십니다.</p>
        </div>
        <div className="page-actions">
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
