/**
 * 날짜 표시·입력 변환.
 *
 * DB는 timestamptz(UTC)로 저장하고 화면은 항상 한국시간으로 보여준다.
 * Vercel 서버는 UTC로 돌기 때문에 new Date(문자열)에 맡기면 9시간이 틀어진다.
 * 그래서 오프셋을 직접 계산한다. (서버·클라이언트 결과가 같아야 하므로 Intl도 쓰지 않는다)
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toKst(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** 2026-03-04 14:20 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toKst(value);
  return d ? d.toISOString().slice(0, 16).replace("T", " ") : "";
}

/** 2026-03-04 */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toKst(value);
  return d ? d.toISOString().slice(0, 10) : "";
}

/** <input type="datetime-local"> 에 넣을 값 */
export function toDateTimeLocal(value: string | Date | null | undefined): string {
  const d = toKst(value);
  return d ? d.toISOString().slice(0, 16) : "";
}

/** <input type="datetime-local"> 값(한국시간)을 UTC ISO 문자열로 */
export function fromDateTimeLocal(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!m) return new Date().toISOString();
  const [, y, mo, d, h, mi] = m;
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - KST_OFFSET_MS,
  ).toISOString();
}

/** 지금 시각을 datetime-local 형식으로 */
export function nowDateTimeLocal(): string {
  return toDateTimeLocal(new Date());
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
