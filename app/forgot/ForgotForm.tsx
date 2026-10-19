"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { requestTemporaryPassword, type ForgotState } from "./actions";

const initialState: ForgotState = { error: null, ok: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={pending}
    >
      {pending ? "보내는 중…" : "임시비밀번호 받기"}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState(requestTemporaryPassword, initialState);

  if (state.ok) {
    return (
      <>
        <div className="flash flash-ok">{state.ok}</div>
        <p className="small dim">
          메일이 보이지 않으면 스팸함도 확인해 보세요. 임시비밀번호로 로그인하면 새 비밀번호를
          정하는 화면이 바로 뜹니다.
        </p>
        <Link
          href="/login"
          className="btn btn-primary"
          style={{ width: "100%", justifyContent: "center" }}
        >
          로그인하러 가기
        </Link>
      </>
    );
  }

  return (
    <form action={formAction}>
      {state.error && <div className="flash flash-error">{state.error}</div>}

      <p className="small dim" style={{ marginTop: 0 }}>
        가입할 때 쓴 아이디와 이메일을 입력하면, 그 이메일로 임시비밀번호를 보내드립니다.
      </p>

      <div className="form-row">
        <label className="lbl" htmlFor="username">
          아이디
        </label>
        <input
          type="text"
          id="username"
          name="username"
          autoComplete="username"
          maxLength={20}
          autoFocus
          required
        />
      </div>

      <div className="form-row">
        <label className="lbl" htmlFor="email">
          이메일
        </label>
        <input type="email" id="email" name="email" maxLength={100} required />
        <div className="help">가입할 때 등록한 이메일이어야 합니다.</div>
      </div>

      <SubmitButton />

      <p className="small dim" style={{ textAlign: "center", marginTop: 14, marginBottom: 0 }}>
        <Link href="/login">로그인으로 돌아가기</Link>
      </p>
    </form>
  );
}
