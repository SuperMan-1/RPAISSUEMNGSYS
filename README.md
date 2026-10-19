# RPA 이슈관리

여러 유지보수 사이트에서 발생하는 RPA 이슈와 정기점검 이력을 한 곳에서 관리한다.
비슷한 이슈를 찾아, 다른 사이트에서 이미 해결한 방법을 지금 처리에 쓰는 것이 목적이다.

요구사항과 설계는 **[prod.md](prod.md)** 에 있다.

## 기술 스택

| 구분 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript |
| DB | Supabase (PostgreSQL) |
| 인증 | Supabase Auth (이메일 + 비밀번호) |
| 파일 | Supabase Storage |
| 배포 | Vercel |
| 스타일 | 자체 CSS (외부 CDN·웹폰트 없음) |

## 준비

### 1. Supabase 프로젝트 만들기

[supabase.com](https://supabase.com) → **New project**
리전은 **Northeast Asia (Seoul)** 로 고른다.

### 2. 스키마 적용

대시보드 → **SQL Editor** 에서 아래 두 파일을 순서대로 붙여넣고 실행한다.

1. `supabase/migrations/0001_init.sql` — 테이블, 인덱스, RLS 정책, 유사이슈 검색 함수, Storage 버킷
2. `supabase/migrations/0002_signup.sql` — 회원가입(아이디·회사·부서·휴대전화)과 가입 승인
3. `supabase/migrations/0003_password_reset.sql` — 비밀번호 분실(임시비밀번호·강제 변경)
4. `supabase/seed.sql` — 이슈 유형 4개, 공통 점검 템플릿

대시보드 → **Authentication → Sign In / Providers → Email** 에서 **Allow new users to
sign up** 을 꺼 둔다. 가입은 이 앱의 `/signup` 화면이 서버에서 처리하므로 Supabase 쪽
공개 가입은 열어 둘 이유가 없다.

같은 화면의 **Password** 영역에서 최소 길이를 8로, **Password Requirements** 를
`Lowercase, uppercase letters, digits and symbols` 로 맞춰 두면 앱 밖에서 비밀번호가
바뀌는 경로에도 같은 기준이 걸린다. 앱 안의 검사는 `lib/account.ts` 가 한다.

### 3. 환경변수

```bash
cp .env.example .env.local
```

대시보드 → **Project Settings → API Keys** 에서 값을 복사해 채운다.

| 변수 | 설명 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개용 키 (`sb_publishable_…`). 브라우저로 전달되며 권한은 RLS가 판정한다 |
| `SUPABASE_SECRET_KEY` | 비밀 키 (`sb_secret_…`). 서버 전용, 절대 공개 금지. 비워도 계정 생성 외 모든 기능이 동작한다 |
| `SMTP_*` | 사내 메일 서버. 비밀번호 분실 시 임시비밀번호를 보내는 데만 쓴다. 비우면 비밀번호 찾기 화면이 안내로 바뀐다. 필수는 `SMTP_HOST` 와 `SMTP_FROM` 둘뿐이다 |
| `NEXT_PUBLIC_SITE_URL` | 메일 본문에 넣을 사이트 주소. 비우면 요청 헤더에서 알아낸다 |

> Supabase가 `anon` / `service_role` 키를 publishable / secret 으로 바꾸는 중이다.
> 예전 키밖에 없는 프로젝트라면 `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
> `SUPABASE_SERVICE_ROLE_KEY` 이름으로 넣어도 그대로 동작한다.
> 코드에서 쓰는 방식은 같고 문자열만 다르다.

**값을 채운 뒤에는 개발 서버를 다시 시작해야 한다.** Next.js는 `.env.local`을
서버가 켜질 때 한 번만 읽는다.

### 4. 첫 관리자 지정

`/signup` 에서 가입 신청을 하거나 대시보드 → **Authentication → Users** 에서 계정을
만든 뒤, `supabase/seed.sql` 맨 아래의 관리자 지정 SQL을 이메일만 바꿔 실행한다.

새 계정은 모두 **승인 대기** 상태로 만들어진다. 첫 관리자는 승인해 줄 사람이 없으므로
그 SQL이 `is_active = true` 까지 같이 켜 준다. 두 번째 사용자부터는 관리자가
**관리 → 사용자** 화면의 &lsquo;승인 대기&rsquo; 에서 승인하면 된다.

### 5. 실행

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인한다.

## 배포 (Vercel)

1. 저장소를 GitHub에 올린다
2. Vercel에서 **Import Project**
3. 환경변수 3개를 동일한 이름으로 등록
4. Deploy

## 계정과 로그인

- 로그인은 **아이디 + 비밀번호**. 아이디는 영문으로 시작하는 영문·숫자 4~20자다.
  Supabase Auth 는 이메일로만 로그인하므로, 서버에서 아이디로 이메일을 찾아 넘긴다
  (`app/login/actions.ts`). 이 조회에 `SUPABASE_SECRET_KEY` 가 쓰인다.
- **회원가입**(`/signup`) 은 기본정보(아이디·이름·이메일·비밀번호)와
  추가정보(회사·부서·휴대전화)를 받는다. 추가정보는 비워도 된다.
- **비밀번호는 8자 이상이고 영문·숫자·특수문자를 모두 포함해야 한다.** 특수문자는
  영문·숫자가 아닌 모든 글자로 본다. 가입, 관리자의 계정 발급, 비밀번호 재설정이
  모두 `lib/account.ts` 의 `validatePassword` 하나를 쓴다.
- 한 이메일로는 계정 하나만 만들 수 있다. 대소문자와 `hong+1@x.com` 식 꼬리표를
  떼어낸 값(`profiles.email_norm`)에 유니크 인덱스가 걸려 있다.
- 가입하면 **승인 대기**(`is_active = false`) 로 들어가고, 관리자가
  **관리 → 사용자** 에서 승인해야 로그인된다. 승인 전 계정은 RLS 때문에 아무 데이터도
  읽지 못한다.
- 가입 트리거(`handle_new_user`)는 역할을 항상 `USER`, 사용 여부를 항상 `false` 로
  만든다. 권한은 서버에서 secret 키로만 올린다. 그렇게 하지 않으면 가입하면서
  user_metadata 에 `role: ADMIN` 을 실어 보내 스스로 관리자가 될 수 있다.

### 비밀번호를 잊었을 때

1. 로그인 화면의 **비밀번호를 잊으셨나요?** → `/forgot`
2. 아이디와 이메일이 **둘 다** 맞아야 한다. 하나만 아는 사람에게는 아무것도 주지 않는다.
   맞지 않아도 "보냈습니다" 라고만 답한다 — 어떤 아이디가 있는지 떠볼 수 없게 하기 위해서다.
3. 임시비밀번호를 만들어 **메일을 먼저 보내고**, 성공한 뒤에 비밀번호를 바꾼다.
   순서를 바꾸면 메일이 실패했을 때 본인도 모르는 사이에 로그인할 수 없게 된다.
4. 임시비밀번호는 **24시간**만 유효하고, 재발급은 **3분**에 한 번으로 제한한다
   (`lib/temp-password.ts`).
5. 임시비밀번호로 로그인하면 `must_change_password` 가 켜져 있어 `requireProfile()` 이
   모든 화면을 막고 `/password/new` 로 보낸다. 새 비밀번호를 정해야 풀린다.

#### 비밀번호가 새지 않도록 해 둔 것

- `lib/mail.ts` 는 `import "server-only"` 로 막혀 있다. 클라이언트 컴포넌트가 실수로
  불러가면 빌드가 깨진다. SMTP 계정이 브라우저로 나갈 길이 없다.
- 임시비밀번호는 **메일로만** 나간다. 화면으로 돌려주지 않고, DB 에도 남기지 않는다
  (Supabase 가 bcrypt 해시만 보관한다). 로그에도 찍지 않는다 — 발송 실패 시
  오류 메시지만 남긴다.
- **STARTTLS 를 기본으로 강제한다**(`SMTP_REQUIRE_TLS`). 끄면 서버가 TLS 를 알리지
  않을 때 nodemailer 가 조용히 평문으로 보내, SMTP 계정과 임시비밀번호가 사내망에
  그대로 흐른다.
- 새 비밀번호를 정하면 **현재 세션만 남기고 나머지 세션을 끊는다**. 임시비밀번호가
  메일함에 있던 동안 남이 먼저 로그인했더라도 그 세션이 살아남지 못한다.
- 남는 위험은 하나다. **임시비밀번호가 메일함에 평문으로 남는다.** 임시비밀번호
  방식의 본질적인 약점이라 없앨 수 없고, 24시간 유효기간과 로그인 즉시 강제 변경으로
  창을 좁혀 놓았다. 더 줄이려면 임시비밀번호 대신 일회용 재설정 링크로 바꿔야 한다.
- 관리자가 발급하는 초기 비밀번호 입력란은 일부러 가리지 않는다(`type="text"`).
  관리자가 읽어서 본인에게 전달해야 하기 때문이다. 옆에서 화면이 보이는 자리라면
  주의가 필요하다.

> `must_change_password` 는 본인이 끌 수 없다. `profiles_guard_columns` 트리거가
> 브라우저 세션(`authenticated` 롤)에서 들어오는 수정을 되돌린다. 비밀번호를 실제로
> 바꾼 뒤 서버가 secret 키로만 내린다. 역할·사용여부·아이디·이메일도 같은 트리거가 지킨다.

## 폴더 구조

```
app/
  login/                  로그인 (아이디 + 비밀번호)
  signup/                 회원가입
  forgot/                 비밀번호 찾기 (임시비밀번호 발송)
  password/new/           임시비밀번호로 들어온 사람의 새 비밀번호 설정
  logout/                 세션을 끊고 로그인 화면으로 (중지된 계정 처리)
  (main)/                 로그인해야 들어가는 화면
lib/
  account.ts              아이디·이메일·비밀번호·휴대전화 검사와 정규화
  mail.ts                 사내 SMTP 발송 (서버 전용)
  temp-password.ts        임시비밀번호 생성과 유효기간 (서버 전용)
  constants.ts            코드값과 표시명 (DB check 제약과 일치해야 함)
  database.types.ts       Supabase 스키마 타입
  supabase/
    client.ts             브라우저용 클라이언트
    server.ts             서버용 클라이언트 + 관리자 클라이언트
    session.ts            세션 갱신·인증 가드
    env.ts                환경변수 읽기
proxy.ts                  요청마다 세션 갱신 (Next 16의 middleware)
supabase/
  migrations/0001_init.sql
  migrations/0002_signup.sql
  migrations/0003_password_reset.sql
  seed.sql
prod.md                   제품 정의서
_archive_python/          초기 FastAPI 구현 (참고용 보관)
```

## 알아둘 것

- **코드값을 바꿀 때는 두 곳을 같이 고쳐야 한다.** `lib/constants.ts` 와
  `supabase/migrations/0001_init.sql` 의 `check` 제약.
- 이슈번호(`2026-0001`)는 DB 트리거가 채운다. 앱에서 넣지 않는다.
- 유사이슈 검색은 DB 함수 `search_similar_issues` 안에 있다. 가중치를 바꾸려면 그 함수를 고친다.
- 아이디 규칙을 바꿀 때도 두 곳을 같이 고친다. `lib/account.ts` 의 `USERNAME_PATTERN` 과
  `profiles_username_format` check 제약.
- 비밀번호 규칙은 `lib/account.ts` 의 `validatePassword` 한 곳에 있다. 화면에 뜨는
  안내 문구도 같은 파일의 `PASSWORD_HELP` 를 쓰므로 규칙과 안내가 어긋나지 않는다.
