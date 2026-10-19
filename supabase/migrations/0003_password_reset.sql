-- =============================================================================
-- 0003 — 비밀번호 분실
--
--   비밀번호를 잃어버리면 등록된 이메일로 임시비밀번호를 보낸다.
--   임시비밀번호로 로그인하면 다른 화면으로 가지 못하고 새 비밀번호를 먼저 정한다.
--
--   0002_signup.sql 을 적용한 뒤 SQL Editor 에서 이 파일을 통째로 실행한다.
-- =============================================================================

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_reset_at    timestamptz;

comment on column public.profiles.must_change_password is
  '임시비밀번호 상태. true 면 새 비밀번호를 정하기 전까지 다른 화면을 쓸 수 없다';
comment on column public.profiles.password_reset_at is
  '임시비밀번호를 발급한 시각. 유효기간 판정과 재발급 간격 제한에 쓴다';

-- ---- 본인이 끌 수 없어야 하는 값 ---------------------------------------------
--
-- profiles_update_self 정책은 본인 행의 수정을 허용한다. 그대로 두면
-- 임시비밀번호 상태인 사람이 비밀번호를 바꾸지 않고 must_change_password 만
-- false 로 되돌릴 수 있다. 권한(role)·사용여부(is_active)·아이디·이메일도 마찬가지다.
--
-- 앱이 쓰는 경로는 두 가지다.
--   · 브라우저 세션(authenticated 롤)  — 화면에서 들어오는 일반 수정
--   · 서버의 secret 키(service_role 롤) — 가입 처리, 임시비밀번호 발급
-- 아래 트리거는 앞쪽만 제한한다. 서버와 SQL Editor 는 그대로 통과한다.

create or replace function public.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- 비밀번호 관련 두 칼럼은 관리자도 화면에서 직접 건드리지 않는다
  new.must_change_password := old.must_change_password;
  new.password_reset_at    := old.password_reset_at;
  new.username             := old.username;
  new.email                := old.email;

  if not public.is_admin() then
    -- 관리자만 남의 역할과 사용여부를 바꿀 수 있다 (사용자 관리 화면)
    new.role      := old.role;
    new.is_active := old.is_active;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_columns on public.profiles;
create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.guard_profile_columns();
