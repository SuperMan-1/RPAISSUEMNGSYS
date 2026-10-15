"use client";

import Link from "next/link";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page">
      <div className="card" style={{ maxWidth: 560, margin: "40px auto" }}>
        <div className="card-body" style={{ textAlign: "center", padding: "32px 24px" }}>
          <div className="flash flash-error" style={{ textAlign: "left" }}>
            {error.message || "요청을 처리하지 못했습니다."}
          </div>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <button type="button" className="btn btn-primary" onClick={reset}>
              다시 시도
            </button>
            <Link className="btn" href="/issues">
              이슈 목록으로
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
