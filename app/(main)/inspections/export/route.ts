import { NextResponse, type NextRequest } from "next/server";

import { getProfile } from "@/lib/auth";
import { RUN_STATUSES } from "@/lib/constants";
import type { RunStatus } from "@/lib/database.types";
import { inspectionListWorkbook, type InspectionListRow } from "@/lib/excel";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { attachmentName } from "../export-name";

type RunRow = {
  inspected_at: string;
  status: RunStatus;
  template: { name: string } | null;
  site: { name: string } | null;
  task: { name: string } | null;
  inspector: { name: string } | null;
  inspection_results: { result: string }[];
};

/** 한 번에 내보낼 최대 건수. 화면은 20건씩 보여주지만 파일은 통째로 받는다 */
const EXPORT_LIMIT = 2000;

/**
 * 점검 이력 목록을 엑셀로 내려준다.
 * 화면에서 건 필터를 그대로 받아 적용하되, 페이지 나눔은 하지 않는다.
 * 목록을 보고 "이 조건으로 뽑아줘" 하는 것이 이 기능의 쓰임이기 때문이다.
 */
export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const sp = request.nextUrl.searchParams;
  const siteId = sp.get("site_id") ?? "";
  const templateId = sp.get("template_id") ?? "";
  const status = sp.get("status") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";

  const supabase = await createClient();

  let query = supabase
    .from("inspection_runs")
    .select(
      `inspected_at, status,
       template:inspection_templates(name),
       site:sites(name),
       task:tasks(name),
       inspector:profiles(name),
       inspection_results(result)`,
    );

  // 화면(app/(main)/inspections/page.tsx)의 필터와 같은 규칙이어야 한다
  if (siteId) query = query.eq("site_id", Number(siteId));
  if (templateId) query = query.eq("template_id", Number(templateId));
  if (status) query = query.eq("status", status as RunStatus);
  if (from) query = query.gte("inspected_at", `${from}T00:00:00+09:00`);
  if (to) query = query.lte("inspected_at", `${to}T23:59:59+09:00`);

  const { data } = await query
    .order("inspected_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(EXPORT_LIMIT);

  const runs = (data ?? []) as unknown as RunRow[];

  const rows: InspectionListRow[] = runs.map((r) => ({
    inspectedAt: formatDate(r.inspected_at),
    siteName: r.site?.name ?? "-",
    taskName: r.task?.name ?? null,
    templateName: r.template?.name ?? "-",
    itemCount: r.inspection_results.length,
    ngCount: r.inspection_results.filter((x) => x.result === "NG").length,
    status: r.status,
    inspectorName: r.inspector?.name ?? "-",
  }));

  // 어떤 조건으로 뽑았는지 파일 안에 남긴다. 나중에 파일만 보고도 알 수 있어야 한다
  const [sites, templates] = await Promise.all([
    siteId
      ? supabase.from("sites").select("name").eq("id", Number(siteId)).maybeSingle()
      : Promise.resolve({ data: null }),
    templateId
      ? supabase
          .from("inspection_templates")
          .select("name")
          .eq("id", Number(templateId))
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const parts: string[] = [];
  if (sites.data?.name) parts.push(`사이트: ${sites.data.name}`);
  if (templates.data?.name) parts.push(`템플릿: ${templates.data.name}`);
  if (status) parts.push(`상태: ${RUN_STATUSES[status as RunStatus] ?? status}`);
  if (from || to) parts.push(`기간: ${from || "처음"} ~ ${to || "오늘"}`);
  parts.push(`${rows.length}건`);
  if (rows.length === EXPORT_LIMIT) parts.push(`(최대 ${EXPORT_LIMIT}건까지)`);

  const buffer = await inspectionListWorkbook(rows, parts.join(" · "));
  const today = new Date().toISOString().slice(0, 10);

  // Blob 으로 감싸는 이유는 타입 때문이다. Uint8Array 는 BodyInit 으로 안 받아준다
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachmentName(`정기점검_이력_${today}.xlsx`),
      "Cache-Control": "no-store",
    },
  });
}
