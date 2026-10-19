"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { PASSWORD_HELP, PASSWORD_MIN, USERNAME_HELP, USERNAME_PATTERN } from "@/lib/account";

import { checkUsername, signUp, type SignupState } from "./actions";

const initialState: SignupState = { error: null };

type Check = { ok: boolean; message: string } | null;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn btn-primary"
      style={{ width: "100%", justifyContent: "center" }}
      disabled={pending}
    >
      {pending ? "가입 신청 중…" : "가입 신청"}
    </button>
  );
}

export function SignupForm() {
  const [state, formAction] = useActionState(signUp, initialState);
  const [check, setCheck] = useState<Check>(null);
  const [checking, startCheck] = useTransition();

  // 아이디는 입력을 마쳤을 때 한 번만 물어본다 (타이핑마다 부르지 않는다)
  function onUsernameBlur(value: string) {
    const username = value.trim().toLowerCase();
    if (!username) {
      setCheck(null);
      return;
    }
    startCheck(async () => setCheck(await checkUsername(username)));
  }

  return (
    <form action={formAction}>
      {state.error && <div className="flash flash-error">{state.error}</div>}

      <h2 className="form-section">기본정보</h2>

      <div className="form-row">
        <label className="lbl" htmlFor="username">
          아이디<span className="req">*</span>
        </label>
        <input
          type="text"
          id="username"
          name="username"
          autoComplete="username"
          pattern={USERNAME_PATTERN}
          minLength={4}
          maxLength={20}
          required
          autoFocus
          onChange={() => setCheck(null)}
          onBlur={(e) => onUsernameBlur(e.target.value)}
        />
        <div className={check ? (check.ok ? "help help-ok" : "help help-err") : "help"}>
          {checking ? "확인 중…" : (check?.message ?? USERNAME_HELP)}
        </div>
      </div>

      <div className="form-row">
        <label className="lbl" htmlFor="name">
          이름<span className="req">*</span>
        </label>
        <input type="text" id="name" name="name" maxLength={50} required />
      </div>

      <div className="form-row">
        <label className="lbl" htmlFor="email">
          이메일<span className="req">*</span>
        </label>
        <input type="email" id="email" name="email" maxLength={100} required />
        <div className="help">한 이메일로는 계정 하나만 만들 수 있습니다.</div>
      </div>

      <div className="form-grid">
        <div>
          <label className="lbl" htmlFor="password">
            비밀번호<span className="req">*</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            required
          />
          <div className="help">{PASSWORD_HELP}</div>
        </div>
        <div>
          <label className="lbl" htmlFor="password_confirm">
            비밀번호 확인<span className="req">*</span>
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
      </div>

      <h2 className="form-section">추가정보</h2>

      <div className="form-grid">
        <div>
          <label className="lbl" htmlFor="company">
            회사
          </label>
          <input type="text" id="company" name="company" maxLength={50} />
        </div>
        <div>
          <label className="lbl" htmlFor="dept">
            부서
          </label>
          <input type="text" id="dept" name="dept" maxLength={50} />
        </div>
        <div className="full">
          <label className="lbl" htmlFor="phone">
            휴대전화
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            inputMode="numeric"
            maxLength={20}
            placeholder="010-1234-5678"
          />
        </div>
      </div>

      <div className="flash flash-warn" style={{ marginTop: 18 }}>
        가입 신청 후 <strong>관리자 승인</strong>을 받아야 로그인할 수 있습니다.
      </div>

      <SubmitButton />

      <p className="small dim" style={{ textAlign: "center", marginTop: 14, marginBottom: 0 }}>
        이미 계정이 있으신가요? <Link href="/login">로그인</Link>
      </p>
    </form>
  );
}
