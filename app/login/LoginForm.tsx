"use client";

import Link from "next/link";
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

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [state, formAction] = useActionState(signIn, initialState);

  return (
    <form action={formAction}>
      {notice && !state.error && <div className="flash flash-ok">{notice}</div>}
      {state.error && <div className="flash flash-error">{state.error}</div>}

      <input type="hidden" name="next" value={next} />

      <div className="form-row">
        <label className="lbl" htmlFor="username">
          아이디
        </label>
        <input
          type="text"
          id="username"
          name="username"
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

      <p className="small dim" style={{ textAlign: "center", marginTop: 14, marginBottom: 4 }}>
        <Link href="/forgot">비밀번호를 잊으셨나요?</Link>
      </p>
      <p className="small dim" style={{ textAlign: "center", margin: 0 }}>
        계정이 없으신가요? <Link href="/signup">회원가입</Link>
      </p>
    </form>
  );
}
