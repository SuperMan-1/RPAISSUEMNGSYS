"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={pending}
    >
      {pending ? "로그인 중…" : "로그인"}
    </button>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction}>
      {state.error && <div className="flash flash-error">{state.error}</div>}

      <input type="hidden" name="next" value={next} />

      <div className="form-row">
        <label className="lbl" htmlFor="email">
          이메일
        </label>
        <input
          type="email"
          id="email"
          name="email"
          autoComplete="username"
          autoFocus
          required
        />
      </div>

      <div className="form-row">
        <label className="lbl" htmlFor="password">
          비밀번호
        </label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <SubmitButton />
    </form>
  );
}
