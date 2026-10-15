"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { saveAndConvert, saveResults } from "@/app/(main)/inspections/actions";
import { CHECK_RESULTS } from "@/lib/constants";
import type { CheckResult } from "@/lib/database.types";

export type ResultRow = {
  id: number;
  seq: number;
  content: string;
  result: CheckResult;
  comment: string | null;
  issue_id: number | null;
  issue_no: string | null;
  note: string | null;
};

export function InspectionResultsForm({
  runId,
  isDone,
  note,
  rows,
}: {
  runId: number;
  isDone: boolean;
  note: string | null;
  rows: ResultRow[];
}) {
  const [results, setResults] = useState<Record<number, CheckResult>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.result])),
  );

  // 어떤 버튼으로 제출했는지 서버에 알리는 값들
  const completeRef = useRef<HTMLInputElement>(null);
  const reopenRef = useRef<HTMLInputElement>(null);
  const convertRef = useRef<HTMLInputElement>(null);

  function setFlags({ complete = "", reopen = "", convert = "" }) {
    if (completeRef.current) completeRef.current.value = complete;
    if (reopenRef.current) reopenRef.current.value = reopen;
    if (convertRef.current) convertRef.current.value = convert;
  }

  const ngCount = rows.filter((r) => results[r.id] === "NG").length;

  return (
    <form action={saveResults}>
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="result_ids" value={rows.map((r) => r.id).join(",")} />
      <input type="hidden" name="complete" ref={completeRef} defaultValue="" />
      <input type="hidden" name="reopen" ref={reopenRef} defaultValue="" />
      <input type="hidden" name="convert_result_id" ref={convertRef} defaultValue="" />

      <div className="card">
        <div className="card-head">
          <h2>점검 항목 {rows.length}개</h2>
          <div className="btn-row">
            {ngCount > 0 && <span className="badge badge-danger">이상 {ngCount}건</span>}
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                setResults(Object.fromEntries(rows.map((r) => [r.id, "OK" as CheckResult])))
              }
            >
              전체 정상
            </button>
          </div>
        </div>

        <div className="card-body tight">
          <ul className="timeline">
            {rows.map((r) => {
              const current = results[r.id] ?? "OK";
              return (
                <li key={r.id}>
                  <div className="t-head">
                    <span className="who">
                      {r.seq}. {r.content}
                    </span>
                  </div>

                  {r.note && (
                    <div className="small dim" style={{ marginBottom: 6 }}>
                      {r.note}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    {(Object.keys(CHECK_RESULTS) as CheckResult[]).map((value) => (
                      <label key={value} className="checkline">
                        <input
                          type="radio"
                          name={`result_${r.id}`}
                          value={value}
                          checked={current === value}
                          onChange={() =>
                            setResults((prev) => ({ ...prev, [r.id]: value }))
                          }
                        />
                        {CHECK_RESULTS[value]}
                      </label>
                    ))}

                    <input
                      type="text"
                      name={`comment_${r.id}`}
                      defaultValue={r.comment ?? ""}
                      maxLength={500}
                      placeholder={
                        current === "NG" ? "무엇이 어떻게 이상한지" : "메모 (선택)"
                      }
                      style={{ flex: 1, minWidth: 200 }}
                    />

                    {r.issue_id ? (
                      <Link className="btn btn-sm" href={`/issues/${r.issue_id}`}>
                        {r.issue_no} 보기
                      </Link>
                    ) : (
                      current === "NG" && (
                        <button
                          type="submit"
                          className="btn btn-sm btn-primary"
                          formAction={saveAndConvert}
                          onClick={() => setFlags({ convert: String(r.id) })}
                        >
                          이슈로 전환
                        </button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>비고</h2>
        </div>
        <div className="card-body">
          <textarea
            name="note"
            rows={3}
            defaultValue={note ?? ""}
            placeholder="점검 전반에 대한 메모"
          />

          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              type="submit"
              className="btn"
              onClick={() => setFlags({})}
            >
              저장
            </button>

            {isDone ? (
              <button
                type="submit"
                className="btn"
                onClick={() => setFlags({ reopen: "1" })}
              >
                다시 열기
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary"
                onClick={() => setFlags({ complete: "1" })}
              >
                저장하고 점검 완료
              </button>
            )}

            {ngCount > 0 && (
              <span className="small dim">
                이상 항목은 &lsquo;이슈로 전환&rsquo;으로 이슈를 만들어 두세요.
              </span>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
