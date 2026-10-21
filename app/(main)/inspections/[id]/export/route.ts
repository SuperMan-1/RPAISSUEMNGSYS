import { NextResponse, type NextRequest } from "next/server";

import { getProfile } from "@/lib/auth";
import { inspectionWorkbook, type InspectionExport } from "@/lib/excel";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { attachmentName } from "../../export-name";

type RunRow = {
  id: number;
  inspected_at: string;
  status: InspectionExport["status"];
  note: string | null;
  template: { name: string } | null;
  site: { name: string } | null;
  task: { name: string } | null;
  inspector: { name: string } | null;
};

type ResultRow = {
  seq: number;
  content: string;
  result: InspectionExport["results"][number]["result"];
  comment: string | null;
  issue: { no: string } | null;
};

/** 점검 한 건의 결과를 엑셀로 내려준다 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // 화면과 달리 리디렉션 대신 상태코드로 답한다. 파일 요청이기 때문이다
  const profile = await getProfile();
  if (!profile) return new NextResponse("로그인이 필요합니다.", { status: 401 });

  const { id } = await params;
  const runId = Number(id);
  if (!Number.isFinite(runId)) {
    return new NextResponse("점검을 찾을 수 없습니다.", { status: 400 });
  }

  const supabase = await createClient();

  const [{ data: runData }, { data: resultData }] = await Promise.all([
    supabase
      .from("inspection_runs")
      .select(
        `id, inspected_at, status, note,
         template:inspection_templates(name),
         site:sites(name),
         task:tasks(name),
         inspector:profiles(name)`,
      )
      .eq("id", runId)
      .maybeSingle(),
    supabase
      .from("inspection_results")
      .select("seq, content, result, comment, issue:issues(no)")
      .eq("run_id", runId)
      .order("seq")
      .order("id"),
  ]);

  if (!runData) return new NextResponse("점검을 찾을 수 없습니다.", { status: 404 });

  const run = runData as unknown as RunRow;
  const results = (resultData ?? []) as unknown as ResultRow[];

  const buffer = await inspectionWorkbook({
    id: run.id,
    templateName: run.template?.name ?? "점검",
    siteName: run.site?.name ?? "-",
    taskName: run.task?.name ?? null,
    inspectedAt: formatDateTime(run.inspected_at),
    inspectorName: run.inspector?.name ?? "-",
    status: run.status,
    note: run.note,
    results: results.map((r) => ({
      seq: r.seq,
      content: r.content,
      result: r.result,
      comment: r.comment,
      issueNo: r.issue?.no ?? null,
    })),
  });

  const name = `점검_${run.site?.name ?? ""}_${run.inspected_at.slice(0, 10)}.xlsx`;

  // Blob 으로 감싸는 이유는 타입 때문이다. Uint8Array 는 BodyInit 으로 안 받아준다
  return new NextResponse(new Blob([buffer]), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": attachmentName(name),
      "Cache-Control": "no-store",
    },
  });
}
