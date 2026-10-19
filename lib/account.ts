/**
 * 계정 입력값 검사·정규화.
 *
 * 가입 화면과 관리자의 계정 발급 화면이 같은 규칙을 쓰도록 여기에 모아 둔다.
 * 최종 판정은 DB 제약(profiles_username_format, profiles_email_norm_key)이 한다.
 * 여기서 거르는 것은 사람이 읽을 메시지를 주기 위해서다.
 */

/** 아이디: 영문 소문자로 시작하는 영문·숫자 4~20자. 한글과 특수문자는 받지 않는다 */
export const USERNAME_PATTERN = "^[a-z][a-z0-9]{3,19}$";
const USERNAME_RE = new RegExp(USERNAME_PATTERN);

export const USERNAME_HELP = "영문으로 시작하는 영문·숫자 4~20자";

/** 입력한 아이디를 저장 형태(소문자)로 */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** 통과하면 null, 아니면 사람이 읽을 메시지 */
export function validateUsername(username: string): string | null {
  if (!username) return "아이디를 입력하세요.";
  if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(username)) return "아이디는 영문으로만 만들 수 있습니다.";
  if (username.length < 4) return "아이디는 4자 이상이어야 합니다.";
  if (username.length > 20) return "아이디는 20자까지 쓸 수 있습니다.";
  if (!/^[a-z]/.test(username)) return "아이디는 영문으로 시작해야 합니다.";
  if (!USERNAME_RE.test(username)) return `아이디는 ${USERNAME_HELP}로 만들 수 있습니다.`;
  return null;
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * 중복 판정용 이메일.
 * 대소문자와 hong+1@x.com 식 꼬리표를 떼어낸다.
 * DB 의 생성 컬럼 profiles.email_norm 과 같은 규칙이어야 한다.
 */
export function emailKey(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return email.toLowerCase();
  const local = email.slice(0, at).toLowerCase().replace(/\+.*$/, "");
  return `${local}@${email.slice(at + 1).toLowerCase()}`;
}

export function validateEmail(email: string): string | null {
  if (!email) return "이메일을 입력하세요.";
  if (!EMAIL_RE.test(email)) return "이메일 형식이 올바르지 않습니다.";
  if (email.length > 100) return "이메일이 너무 깁니다.";
  return null;
}

/** 휴대전화: 숫자만 남겨 010-0000-0000 꼴로. 비어 있으면 null */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

export function validatePhone(phone: string | null): string | null {
  if (!phone) return null; // 추가정보라 비워도 된다
  if (!/^01[016789]-\d{3,4}-\d{4}$/.test(phone)) {
    return "휴대전화 번호를 확인하세요. (예: 010-1234-5678)";
  }
  return null;
}

export const PASSWORD_MIN = 8;

export function validatePassword(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`;
  }
  if (confirm !== undefined && password !== confirm) {
    return "비밀번호가 서로 다릅니다.";
  }
  return null;
}
