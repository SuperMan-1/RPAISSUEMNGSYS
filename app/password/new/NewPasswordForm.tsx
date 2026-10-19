"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { PASSWORD_HELP, PASSWORD_MIN } from "@/lib/account";

import { setNewPassword, type NewPasswordState } from "./actions";

const initialState: NewPasswordState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={pending}
    >
      {pending ? "바꾸는 중…" : "새 비밀번호로 변경"}
    </button>
  );
}

export function NewPasswordForm() {
  const [state, formAction] = useActionState(setNewPassword, initialState);

  return (
    <form action={formAction}>
      {state.error && <div className="flash flash-error">{state.error}</div>}

      <div className="form-row">
        <label className="lbl" htmlFor="password">
          새 비밀번호
        </label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          autoFocus
          required
        />
        <div className="help">{PASSWORD_HELP}</div>
      </div>

      <div className="form-row">
        <label className="lbl" htmlFor="password_confirm">
          새 비밀번호 확인
        </label>
        <input
          type="password"
          id="password_confirm"
          name="password_confirm"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
