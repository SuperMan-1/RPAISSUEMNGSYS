/**
 * 임시비밀번호 생성.
 *
 * 메일로 받아 손으로 옮겨 적는 값이므로 헷갈리는 글자(l, I, 1, O, 0)는 뺀다.
 * lib/account.ts 의 validatePassword 를 통과하도록 영문·숫자·특수문자를 섞는다.
 *
 * node:crypto 를 쓰므로 서버 전용이다. lib/account.ts 는 가입 화면(클라이언트)도
 * 불러가기 때문에 그쪽에 두지 않고 따로 뺐다.
 */

import "server-only";

import { randomInt } from "node:crypto";

const LETTERS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*";

/** 임시비밀번호 유효시간 */
export const TEMP_PASSWORD_HOURS = 24;

/** 같은 사람에게 다시 발급해 주기까지 기다리는 시간 (메일 폭주 방지) */
export const TEMP_PASSWORD_REISSUE_MINUTES = 3;

function pick(source: string, count: number): string[] {
  return Array.from({ length: count }, () => source[randomInt(source.length)]);
}

export function generateTemporaryPassword(): string {
  const chars = [...pick(LETTERS, 6), ...pick(DIGITS, 3), ...pick(SYMBOLS, 2)];

  // Fisher-Yates. 자리마다 종류가 고정돼 있으면 추측 범위가 좁아진다
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

/** 임시비밀번호가 아직 쓸 수 있는지 */
export function isTemporaryPasswordAlive(issuedAt: string | null): boolean {
  if (!issuedAt) return false;
  const elapsed = Date.now() - new Date(issuedAt).getTime();
  return elapsed < TEMP_PASSWORD_HOURS * 60 * 60 * 1000;
}

/** 방금 발급했는지 (재발급 간격 제한) */
export function isReissueTooSoon(issuedAt: string | null): boolean {
  if (!issuedAt) return false;
  const elapsed = Date.now() - new Date(issuedAt).getTime();
  return elapsed < TEMP_PASSWORD_REISSUE_MINUTES * 60 * 1000;
}
