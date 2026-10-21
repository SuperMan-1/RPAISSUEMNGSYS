/**
 * 점검 결과 엑셀 파일 만들기.
 *
 * PDF 대신 엑셀로 간 이유는 한글 때문이다. Node 에서 PDF 를 직접 만들려면 한글
 * 폰트 파일을 함께 넣어야 하고(폐쇄망 반입·라이선스), Puppeteer 류는 Chromium 을
 * 끌고 온다. PDF 가 필요하면 화면에서 인쇄(Ctrl+P → PDF 로 저장)를 쓴다.
 * 인쇄 전용 스타일은 app/globals.css 에 있다.
 *
 * 서버에서만 부른다.
 */

import "server-only";

import ExcelJS from "exceljs";

import { ACTION_RESULTS, CHECK_RESULTS, RUN_STATUSES } from "@/lib/constants";
import type { CheckResult, RunStatus } from "@/lib/database.types";

const HEADER_FILL = "FFEFF3F8";
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD7DCE3" } },
  left: { style: "thin", color: { argb: "FFD7DCE3" } },
  bottom: { style: "thin", color: { argb: "FFD7DCE3" } },
  right: { style: "thin", color: { argb: "FFD7DCE3" } },
};

/** 결과에 따라 글자색을 달리해 눈으로 훑기 쉽게 한다 */
const RESULT_COLOR: Record<CheckResult, string> = {
  OK: "FF1F7A4D",
  NG: "FFB3261E",
  NA: "FF8A93A0",
};

function titleRow(sheet: ExcelJS.Worksheet, text: string, span: number) {
  const row = sheet.addRow([text]);
  sheet.mergeCells(row.number, 1, row.number, span);
  row.getCell(1).font = { bold: true, size: 14 };
  row.height = 22;
  return row;
}

function headerRow(sheet: ExcelJS.Worksheet, labels: string[]) {
  const row = sheet.addRow(labels);
  row.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = BORDER;
    cell.alignment = { vertical: "middle" };
  });
  row.height = 20;
  return row;
}

export type InspectionExport = {
  id: number;
  templateName: string;
  siteName: string;
  taskName: string | null;
  inspectedAt: string;
  inspectorName: string;
  status: RunStatus;
  note: string | null;
  results: {
    seq: number;
    content: string;
    result: CheckResult;
    comment: string | null;
    issueNo: string | null;
  }[];
};

/** 점검 한 건의 결과표 */
export async function inspectionWorkbook(run: InspectionExport): Promise<Uint8Array<ArrayBuffer>> {
  const book = new ExcelJS.Workbook();
  book.created = new Date();
  const sheet = book.addWorksheet("점검결과", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { width: 8 },
    { width: 52 },
    { width: 11 },
    { width: 38 },
    { width: 14 },
  ];

  titleRow(sheet, run.templateName, 5);

  // ---- 머리말 ----
  const info: [string, string][] = [
    ["사이트 · 과제", run.siteName + (run.taskName ? ` › ${run.taskName}` : "")],
    ["점검일시", run.inspectedAt],
    ["점검자", run.inspectorName],
    ["상태", RUN_STATUSES[run.status] ?? run.status],
  ];

  for (const [label, value] of info) {
    const row = sheet.addRow([label, value]);
    sheet.mergeCells(row.number, 2, row.number, 5);
    row.getCell(1).font = { bold: true, color: { argb: "FF5D6775" } };
    row.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    row.getCell(1).border = BORDER;
    row.getCell(2).border = BORDER;
  }

  // ---- 요약 ----
  const counts = { OK: 0, NG: 0, NA: 0 } as Record<CheckResult, number>;
  for (const r of run.results) counts[r.result] += 1;
  const pending = run.results.filter((r) => r.result === "NG" && !r.issueNo).length;

  const summary = sheet.addRow([
    "집계",
    `전체 ${run.results.length}개 · 정상 ${counts.OK} · 이상 ${counts.NG} · 해당없음 ${counts.NA}` +
      (pending > 0 ? `  (이상 중 ${pending}건 이슈 미등록)` : ""),
  ]);
  sheet.mergeCells(summary.number, 2, summary.number, 5);
  summary.getCell(1).font = { bold: true, color: { argb: "FF5D6775" } };
  summary.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  summary.getCell(1).border = BORDER;
  summary.getCell(2).border = BORDER;
  if (pending > 0) summary.getCell(2).font = { color: { argb: "FF9A6400" }, bold: true };

  sheet.addRow([]);

  // ---- 항목 표 ----
  headerRow(sheet, ["순번", "점검 내용", "결과", "코멘트", "연결 이슈"]);

  for (const r of run.results) {
    const row = sheet.addRow([
      r.seq,
      r.content,
      CHECK_RESULTS[r.result] ?? r.result,
      r.comment ?? "",
      r.issueNo ?? "",
    ]);
    row.eachCell((cell) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "top", wrapText: true };
    });
    row.getCell(1).alignment = { vertical: "top", horizontal: "center" };
    row.getCell(3).alignment = { vertical: "top", horizontal: "center" };
    row.getCell(3).font = { bold: true, color: { argb: RESULT_COLOR[r.result] } };
  }

  // ---- 비고 ----
  if (run.note) {
    sheet.addRow([]);
    const label = sheet.addRow(["비고", run.note]);
    sheet.mergeCells(label.number, 2, label.number, 5);
    label.getCell(1).font = { bold: true, color: { argb: "FF5D6775" } };
    label.getCell(1).border = BORDER;
    label.getCell(2).border = BORDER;
    label.getCell(2).alignment = { vertical: "top", wrapText: true };
  }

  // 머리말 4줄 + 집계 + 빈 줄 + 표머리 = 항목 표의 머리글 행 번호
  sheet.views = [{ state: "frozen", ySplit: 8 }];

  return (await book.xlsx.writeBuffer()) as unknown as Uint8Array<ArrayBuffer>;
}

export type InspectionListRow = {
  inspectedAt: string;
  siteName: string;
  taskName: string | null;
  templateName: string;
  itemCount: number;
  ngCount: number;
  status: RunStatus;
  inspectorName: string;
};

/** 점검 이력 목록 (화면의 필터가 적용된 결과) */
export async function inspectionListWorkbook(
  rows: InspectionListRow[],
  filterNote: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const book = new ExcelJS.Workbook();
  book.created = new Date();
  const sheet = book.addWorksheet("점검이력", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  sheet.columns = [
    { width: 13 },
    { width: 24 },
    { width: 24 },
    { width: 9 },
    { width: 9 },
    { width: 10 },
    { width: 14 },
  ];

  titleRow(sheet, "정기점검 이력", 7);

  const note = sheet.addRow([filterNote || "전체"]);
  sheet.mergeCells(note.number, 1, note.number, 7);
  note.getCell(1).font = { color: { argb: "FF5D6775" }, size: 10 };

  sheet.addRow([]);
  headerRow(sheet, [
    "점검일",
    "사이트 · 과제",
    "템플릿",
    "항목",
    "이상",
    "상태",
    "점검자",
  ]);

  for (const r of rows) {
    const row = sheet.addRow([
      r.inspectedAt,
      r.siteName + (r.taskName ? ` › ${r.taskName}` : ""),
      r.templateName,
      r.itemCount,
      r.ngCount,
      RUN_STATUSES[r.status] ?? r.status,
      r.inspectorName,
    ]);
    row.eachCell((cell) => {
      cell.border = BORDER;
      cell.alignment = { vertical: "middle" };
    });
    for (const col of [4, 5]) {
      row.getCell(col).alignment = { vertical: "middle", horizontal: "center" };
    }
    if (r.ngCount > 0) {
      row.getCell(5).font = { bold: true, color: { argb: RESULT_COLOR.NG } };
    }
  }

  sheet.views = [{ state: "frozen", ySplit: 4 }];
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };

  return (await book.xlsx.writeBuffer()) as unknown as Uint8Array<ArrayBuffer>;
}

/** 조치 결과 표시명 — 이슈 쪽 내보내기를 붙일 때 쓴다 */
export { ACTION_RESULTS };
