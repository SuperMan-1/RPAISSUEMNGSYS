-- =============================================================================
-- 0002 — 회원가입
--
--   로그인을 이메일에서 "아이디"로 바꾸고, 가입 신청에 필요한 항목을 프로필에 붙인다.
--     기본정보 : 아이디 / 이름 / 이메일
--     추가정보 : 회사 / 부서 / 휴대전화
--
--   가입은 누구나 할 수 있지만 is_active = false 로 들어간다.
--   관리자가 사용자 관리 화면에서 승인해야 로그인된다.
--
--   0001_init.sql 을 적용한 뒤 SQL Editor 에서 이 파일을 통째로 실행한다.
-- =============================================================================

-- ---- 1. 컬럼 추가 -----------------------------------------------------------

alter table public.profiles
  add column if not exists username text,
  add column if not exists email    text,
  add column if not exists company  text,
  add column if not exists dept     text,
  add column if not exists phone    text;

comment on column public.profiles.username is '로그인 아이디. 영문 소문자로 시작하는 영문·숫자 4~20자';
comment on column public.profiles.email    is 'auth.users.email 사본. 목록 표시와 이메일 1개당 계정 1개 제약에 쓴다';
comment on column public.profiles.company  is '회사 (추가정보, 선택)';
comment on column public.profiles.dept     is '부서 (추가정보, 선택)';
comment on column public.profiles.phone    is '휴대전화 (추가정보, 선택). 010-0000-0000 형태로 저장';

-- ---- 2. 아이디 자동 생성 ----------------------------------------------------
-- 대시보드에서 직접 만든 계정처럼 아이디 없이 들어오는 경우를 위해
-- 이메일 앞부분으로 비어 있지 않은 아이디를 만들어 둔다.

create or replace function public.generate_username(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  base      text;
  candidate text;
  n         int := 0;
begin
  base := lower(regexp_replace(split_part(coalesce(p_email, ''), '@', 1), '[^a-zA-Z0-9]', '', 'g'));
  if base !~ '^[a-z]' then
    base := 'u' || base;
  end if;
  base := left(base, 16);
  if length(base) < 4 then
    base := rpad(base, 4, '0');
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(base, 20 - length(n::text)) || n;
  end loop;

  return candidate;
end;
$$;

-- ---- 3. 기존 계정 채우기 ----------------------------------------------------
-- 아이디가 없으면 로그인할 수 없으므로 이미 있는 계정부터 메꾼다.

update public.profiles p
set email = lower(u.email)
from auth.users u
where u.id = p.id and p.email is null and u.email is not null;

do $$
declare
  r record;
begin
  for r in
    select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.username is null
    order by p.created_at
  loop
    update public.profiles
    set username = public.generate_username(r.email)
    where id = r.id;
  end loop;
end;
$$;

-- auth.users 와 짝이 없는 프로필이 남아 있으면 그쪽도 채운다 (not null 제약 때문)
update public.profiles
set username = public.generate_username(email)
where username is null;

-- ---- 4. 제약 ----------------------------------------------------------------

alter table public.profiles alter column username set not null;

alter table public.profiles
  drop constraint if exists profiles_username_format;
alter table public.profiles
  add constraint profiles_username_format check (username ~ '^[a-z][a-z0-9]{3,19}$');

create unique index if not exists profiles_username_key on public.profiles (username);

-- 이메일 1개로 계정 여러 개를 받는 것을 막는다.
-- 대소문자와 gmail 식 +꼬리표(hong+1@x.com)를 떼어낸 값으로 비교한다.
alter table public.profiles
  drop column if exists email_norm;
alter table public.profiles
  add column email_norm text generated always as (
    case
      when email is null or email = '' then null
      else lower(regexp_replace(split_part(email, '@', 1), '\+.*$', ''))
           || '@' || lower(split_part(email, '@', 2))
    end
  ) stored;

comment on column public.profiles.email_norm is '중복 판정용 이메일. email 에서 자동 계산된다';

create unique index if not exists profiles_email_norm_key on public.profiles (email_norm);

-- ---- 5. 가입 트리거 ---------------------------------------------------------
-- auth.users 가 생기면 프로필을 만든다.
--
-- role 과 is_active 는 메타데이터에서 받지 않는다.
-- user_metadata 는 클라이언트가 보내는 값이라, 그대로 믿으면 가입하면서
-- 스스로 관리자가 될 수 있다. 권한은 생성 직후 서버(secret 키)에서만 올린다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, is_active, username, email, company, dept, phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    'USER',
    false,
    coalesce(
      nullif(lower(new.raw_user_meta_data ->> 'username'), ''),
      public.generate_username(new.email)
    ),
    lower(new.email),
    nullif(new.raw_user_meta_data ->> 'company', ''),
    nullif(new.raw_user_meta_data ->> 'dept', ''),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---- 6. 아이디 중복 확인 ----------------------------------------------------
-- 가입 화면에서 로그인 전에 부르는 함수.
-- 아이디가 이미 있는지 true/false 만 돌려준다. 이름이나 이메일은 나가지 않는다.

create or replace function public.username_taken(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where username = lower(p_username)
  );
$$;

revoke all on function public.username_taken(text) from public;
grant execute on function public.username_taken(text) to anon, authenticated;
