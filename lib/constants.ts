/**
 * 코드값과 화면 표시명.
 * DB 의 check 제약(0001_init.sql)과 반드시 같은 값을 유지해야 한다.
 */

import type {
  ActionResult,
  CheckResult,
  IssueStatus,
  RunStatus,
  Severity,
  UserRole,
} from "./database.types";

export const SEVERITIES: Record<Severity, string> = {
  HIGH: "높음",
  MEDIUM: "보통",
  LOW: "낮음",
};

export const ISSUE_STATUSES: Record<IssueStatus, string> = {
  RECEIVED: "접수",
  IN_PROGRESS: "처리중",
  ACTION_DONE: "조치완료",
  CLOSED: "종료",
  ON_HOLD: "보류",
};

export const ACTION_RESULTS: Record<ActionResult, string> = {
  RESOLVED: "해결",
  TEMPORARY: "임시조치",
  UNRESOLVED: "미해결",
};

export const CHECK_RESULTS: Record<CheckResult, string> = {
  OK: "정상",
  NG: "이상",
  NA: "해당없음",
};

export const RUN_STATUSES: Record<RunStatus, string> = {
  IN_PROGRESS: "진행중",
  DONE: "완료",
};

export const USER_ROLES: Record<UserRole, string> = {
  ADMIN: "관리자",
  USER: "일반",
};

/** 종료되지 않은 상태들 */
export const OPEN_STATUSES: IssueStatus[] = [
  "RECEIVED",
  "IN_PROGRESS",
  "ACTION_DONE",
  "ON_HOLD",
];

/** 목록 화면 페이지당 건수 */
export const PAGE_SIZE = 20;

/** 첨부파일 1개당 최대 크기 */
export const MAX_UPLOAD_MB = 20;

/** 첨부를 거부하는 실행 가능 형식 */
export const BLOCKED_EXTENSIONS = [
  ".exe", ".bat", ".cmd", ".com", ".scr", ".msi",
  ".ps1", ".vbs", ".js", ".jar", ".sh",
];

/** 첨부파일을 담는 Storage 버킷 */
export const ATTACHMENT_BUCKET = "attachments";
