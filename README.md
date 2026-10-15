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
2. `supabase/seed.sql` — 이슈 유형 4개, 공통 점검 템플릿

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

> Supabase가 `anon` / `service_role` 키를 publishable / secret 으로 바꾸는 중이다.
> 예전 키밖에 없는 프로젝트라면 `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
> `SUPABASE_SERVICE_ROLE_KEY` 이름으로 넣어도 그대로 동작한다.
> 코드에서 쓰는 방식은 같고 문자열만 다르다.

**값을 채운 뒤에는 개발 서버를 다시 시작해야 한다.** Next.js는 `.env.local`을
서버가 켜질 때 한 번만 읽는다.

### 4. 첫 관리자 지정

대시보드 → **Authentication → Users** 에서 계정을 만든 뒤,
`supabase/seed.sql` 맨 아래의 관리자 지정 SQL을 이메일만 바꿔 실행한다.

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

## 폴더 구조

```
app/                      화면 (App Router)
lib/
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
  seed.sql
prod.md                   제품 정의서
_archive_python/          초기 FastAPI 구현 (참고용 보관)
```

## 알아둘 것

- **코드값을 바꿀 때는 두 곳을 같이 고쳐야 한다.** `lib/constants.ts` 와
  `supabase/migrations/0001_init.sql` 의 `check` 제약.
- 이슈번호(`2026-0001`)는 DB 트리거가 채운다. 앱에서 넣지 않는다.
- 유사이슈 검색은 DB 함수 `search_similar_issues` 안에 있다. 가중치를 바꾸려면 그 함수를 고친다.
