"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export type FormState = { error: string | null; ok?: string | null };

const INITIAL: FormState = { error: null };

function Submit({ label, className }: { label: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "처리 중…" : label}
    </button>
  );
}

/**
 * 오류 메시지를 폼 안에 보여주는 작은 래퍼.
 *
 * 관리 화면에는 "코드 중복" 같은 예상 가능한 입력 오류가 흔하다.
 * 그런 것까지 전체 화면 오류로 튀지 않게 한다.
 *
 * 새로 만드는 폼은 성공 시 액션이 같은 경로로 redirect 하므로
 * 입력값이 저절로 비워진다.
 */
export function StateForm({
  action,
  children,
  submitLabel = "저장",
  submitClassName = "btn btn-primary",
  footer,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
  submitClassName?: string;
  footer?: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <form action={formAction}>
      {state.error && <div className="flash flash-error">{state.error}</div>}
      {state.ok && <div className="flash flash-ok">{state.ok}</div>}
      {children}
      <div className="btn-row" style={{ marginTop: 12 }}>
        <Submit label={submitLabel} className={submitClassName} />
        {footer}
      </div>
    </form>
  );
}
