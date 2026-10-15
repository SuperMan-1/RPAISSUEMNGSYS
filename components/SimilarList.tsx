import Link from "next/link";

import { CopyActionButton } from "@/components/CopyActionButton";
import { ISSUE_STATUSES } from "@/lib/constants";
import type { SimilarIssue } from "@/lib/database.types";
import { formatDate } from "@/lib/format";

/**
 * 유사 이슈 목록.
 * "use client" 를 붙이지 않아 서버 화면에서도, 클라이언트 화면에서도 쓸 수 있다.
 *
 * copyTargetId 를 주면 각 항목에 "처리내용 가져오기" 버튼이 붙는다.
 */
export function SimilarList({
  hits,
  copyTargetId,
  emptyText = "비슷한 이슈가 없습니다.",
}: {
  hits: SimilarIssue[];
  copyTargetId?: string;
  emptyText?: string;
}) {
  if (hits.length === 0) {
    return <div className="empty">{emptyText}</div>;
  }

  return (
    <ul className="similar">
      {hits.map((h) => (
        <li key={h.issue_id}>
          <Link className="s-title" href={`/issues/${h.issue_id}`} target="_blank">
            {h.issue_title}
          </Link>

          <div className="s-meta">
            <span className="mono">{h.issue_no}</span>
            <span className="sep">|</span>
            {h.site_name}
            {h.task_name ? ` › ${h.task_name}` : ""}
            <span className="sep">|</span>
            {formatDate(h.occurred_at)}
            <span className="sep">|</span>
            {ISSUE_STATUSES[h.issue_status] ?? h.issue_status}
          </div>

          {h.last_action_content ? (
            <>
              <div className="s-action">{h.last_action_content}</div>
              <div className="btn-row" style={{ marginTop: 6 }}>
                {copyTargetId && (
                  <CopyActionButton
                    targetId={copyTargetId}
                    content={h.last_action_content}
                    reference={h.issue_no}
                  />
                )}
                <Link className="btn btn-sm" href={`/issues/${h.issue_id}`} target="_blank">
                  상세 보기
                </Link>
              </div>
            </>
          ) : (
            <div className="small dim" style={{ marginTop: 4 }}>
              등록된 처리 이력 없음
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
