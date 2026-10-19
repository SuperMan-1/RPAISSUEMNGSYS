/**
 * 메일 발송 (사내 SMTP).
 *
 * 비밀번호를 잃어버린 사람에게 임시비밀번호를 보내는 데만 쓴다.
 * 설정이 없으면 보내지 않고 그 사실을 돌려준다. 화면에서 안내로 바꿔 보여준다.
 *
 * 서버에서만 부른다. SMTP 계정 정보가 브라우저로 나가면 안 된다.
 */

import "server-only";

import nodemailer from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT ?? 587);
const USER = process.env.SMTP_USER;
const PASSWORD = process.env.SMTP_PASSWORD;
const FROM = process.env.SMTP_FROM;

/** 465 는 접속부터 TLS(SMTPS), 587 은 평문으로 붙었다가 STARTTLS 로 올린다 */
const SECURE = process.env.SMTP_SECURE
  ? process.env.SMTP_SECURE === "true"
  : PORT === 465;

/**
 * STARTTLS 를 반드시 쓸 것인가.
 *
 * 이 값이 false 면 서버가 STARTTLS 를 알리지 않을 때 nodemailer 가 조용히 평문으로
 * 보낸다. 그러면 SMTP 계정과 임시비밀번호가 사내망에 그대로 흐른다. 기본을 true 로
 * 두어, 암호화하지 못하면 보내지 않고 실패하게 한다.
 *
 * 평문 중계만 하는 사내 릴레이(보통 25번 포트)를 쓸 때만 false 로 내린다.
 */
const REQUIRE_TLS = process.env.SMTP_REQUIRE_TLS
  ? process.env.SMTP_REQUIRE_TLS === "true"
  : !SECURE && PORT !== 25;

/**
 * 서버 인증서를 검증할 것인가.
 * 사내 메일 서버가 사설 인증서를 쓰면 검증에 걸려 붙지 못한다. 그때만 false 로 내린다.
 * 내리면 중간자 공격을 막지 못하므로, 사내망 안에서만 쓰는 경우로 한정한다.
 */
const REJECT_UNAUTHORIZED = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

export function isMailConfigured(): boolean {
  return Boolean(HOST && FROM);
}

function transport() {
  if (!HOST || !FROM) {
    throw new Error("SMTP_HOST 와 SMTP_FROM 이 없습니다. 메일을 보낼 수 없습니다.");
  }

  return nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: SECURE,
    requireTLS: REQUIRE_TLS,
    tls: { rejectUnauthorized: REJECT_UNAUTHORIZED },
    // 사내 서버가 인증 없이 중계하는 경우도 있어 계정이 없으면 생략한다
    auth: USER ? { user: USER, pass: PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

type Mail = { to: string; subject: string; text: string; html?: string };

/**
 * 메일 한 통.
 * 보내지 못해도 예외를 던지지 않는다. 부르는 쪽이 성공 여부를 보고 판단한다.
 */
export async function sendMail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  if (!isMailConfigured()) {
    return { ok: false, error: "메일 설정(SMTP_HOST, SMTP_FROM)이 없습니다." };
  }

  try {
    await transport().sendMail({ from: FROM, ...mail });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // 비밀번호가 섞여 나가지 않도록 메시지만 남긴다
    console.error("[mail] 발송 실패:", message);
    return { ok: false, error: message };
  }
}

/** 임시비밀번호 안내 메일 */
export function temporaryPasswordMail(args: {
  to: string;
  name: string;
  username: string;
  password: string;
  hours: number;
  loginUrl: string;
}): Mail {
  const { to, name, username, password, hours, loginUrl } = args;

  const text = [
    `${name}님,`,
    "",
    "RPA 이슈관리 임시비밀번호를 보내드립니다.",
    "",
    `  아이디       ${username}`,
    `  임시비밀번호 ${password}`,
    "",
    `이 임시비밀번호는 ${hours}시간 동안만 쓸 수 있습니다.`,
    "로그인하면 새 비밀번호를 설정하는 화면으로 바로 넘어갑니다.",
    "",
    loginUrl,
    "",
    "본인이 요청하지 않았다면 이 메일을 무시하세요. 기존 비밀번호는 이미 바뀌었으므로,",
    "관리자에게 알려 계정을 확인받으시기 바랍니다.",
  ].join("\n");

  const html = `
<div style="font-family:'Malgun Gothic',sans-serif;font-size:14px;line-height:1.6;color:#1c2430">
  <p>${escapeHtml(name)}님,</p>
  <p>RPA 이슈관리 임시비밀번호를 보내드립니다.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr>
      <td style="padding:6px 16px 6px 0;color:#5d6775">아이디</td>
      <td style="padding:6px 0;font-weight:600">${escapeHtml(username)}</td>
    </tr>
    <tr>
      <td style="padding:6px 16px 6px 0;color:#5d6775">임시비밀번호</td>
      <td style="padding:6px 0;font-weight:600;font-family:Consolas,monospace">${escapeHtml(password)}</td>
    </tr>
  </table>
  <p>이 임시비밀번호는 <strong>${hours}시간</strong> 동안만 쓸 수 있습니다.
     로그인하면 새 비밀번호를 설정하는 화면으로 바로 넘어갑니다.</p>
  <p><a href="${escapeHtml(loginUrl)}" style="color:#2563a8">${escapeHtml(loginUrl)}</a></p>
  <p style="color:#5d6775;font-size:13px">
    본인이 요청하지 않았다면 이 메일을 무시하세요. 기존 비밀번호는 이미 바뀌었으므로,
    관리자에게 알려 계정을 확인받으시기 바랍니다.
  </p>
</div>`.trim();

  return { to, subject: "[RPA 이슈관리] 임시비밀번호 안내", text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
