import {
  ACTION_RESULTS,
  CHECK_RESULTS,
  ISSUE_STATUSES,
  SEVERITIES,
} from "@/lib/constants";
import type {
  ActionResult,
  CheckResult,
  IssueStatus,
  Severity,
} from "@/lib/database.types";

const STATUS_CLASS: Record<IssueStatus, string> = {
  RECEIVED: "badge-info",
  IN_PROGRESS: "badge-warn",
  ACTION_DONE: "badge-ok",
  CLOSED: "badge-neutral",
  ON_HOLD: "badge-neutral",
};

const SEVERITY_CLASS: Record<Severity, string> = {
  HIGH: "badge-danger",
  MEDIUM: "badge-warn",
  LOW: "badge-neutral",
};

const ACTION_CLASS: Record<ActionResult, string> = {
  RESOLVED: "badge-ok",
  TEMPORARY: "badge-warn",
  UNRESOLVED: "badge-danger",
};

const CHECK_CLASS: Record<CheckResult, string> = {
  OK: "badge-ok",
  NG: "badge-danger",
  NA: "badge-neutral",
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className={`badge ${STATUS_CLASS[status] ?? "badge-neutral"}`}>
      {ISSUE_STATUSES[status] ?? status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge ${SEVERITY_CLASS[severity] ?? "badge-neutral"}`}>
      {SEVERITIES[severity] ?? severity}
    </span>
  );
}

export function ActionResultBadge({ result }: { result: ActionResult }) {
  return (
    <span className={`badge ${ACTION_CLASS[result] ?? "badge-neutral"}`}>
      {ACTION_RESULTS[result] ?? result}
    </span>
  );
}

export function CheckResultBadge({ result }: { result: CheckResult }) {
  return (
    <span className={`badge ${CHECK_CLASS[result] ?? "badge-neutral"}`}>
      {CHECK_RESULTS[result] ?? result}
    </span>
  );
}
