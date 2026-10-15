-- =============================================================================
-- RPA 이슈관리 — 초기 스키마
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 이 파일 전체를 붙여넣고 실행
-- 적용 순서: 0001_init.sql → seed.sql
--
-- 설계 근거는 prod.md 참고
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. 사용자 프로필
--    인증(이메일/비밀번호)은 Supabase Auth 가 담당하고,
--    이름·역할 같은 업무 정보만 여기에 둔다.
-- =============================================================================

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text        not null default '',
  role       text        not null default 'USER' check (role in ('ADMIN', 'USER')),
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

comment on table public.profiles is '사용자 프로필 (auth.users 1:1)';

-- auth.users 가 생기면 프로필을 자동으로 만든다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'role' = 'ADMIN' then 'ADMIN' else 'USER' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 권한 헬퍼.
-- security definer 로 두어야 profiles 의 RLS 정책이 자기 자신을 다시 호출하는
-- 무한 재귀에 빠지지 않는다.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role = 'ADMIN'
  );
$$;

-- =============================================================================
-- 2. 마스터 — 사이트 / 과제 / 이슈유형 / 태그
--    사이트(1단계) → 과제(2단계) 계층
-- =============================================================================

create table public.sites (
  id         bigint generated always as identity primary key,
  code       text    not null unique,
  name       text    not null,
  note       text,
  is_active  boolean not null default true,
  sort_order int     not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.sites is '사이트 = 고객사/현장';

create table public.tasks (
  id         bigint generated always as identity primary key,
  site_id    bigint  not null references public.sites (id) on delete cascade,
  code       text    not null,
  name       text    not null,
  note       text,
  is_active  boolean not null default true,
  sort_order int     not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, code)
);

comment on table public.tasks is '과제 = 사이트 안에서 돌아가는 개별 RPA 업무';

create table public.issue_types (
  id         bigint generated always as identity primary key,
  name       text    not null unique,
  is_active  boolean not null default true,
  sort_order int     not null default 0
);

create table public.tags (
  id   bigint generated always as identity primary key,
  name text not null unique
);

create index on public.tasks (site_id);
create index on public.tags (lower(name));

-- =============================================================================
-- 3. 정기점검 — 템플릿 / 항목 / 실행이력
--    (issues 가 inspection_runs 를 참조하므로 먼저 만든다)
-- =============================================================================

create table public.inspection_templates (
  id          bigint generated always as identity primary key,
  name        text    not null,
  description text,
  site_id     bigint  references public.sites (id) on delete set null,  -- NULL = 공통
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.inspection_templates.site_id is 'NULL 이면 모든 사이트 공통 템플릿';

create table public.inspection_items (
  id          bigint generated always as identity primary key,
  template_id bigint not null references public.inspection_templates (id) on delete cascade,
  seq         int    not null default 0,
  content     text   not null,
  note        text
);

create table public.inspection_runs (
  id           bigint generated always as identity primary key,
  template_id  bigint      not null references public.inspection_templates (id),
  site_id      bigint      not null references public.sites (id),
  task_id      bigint      references public.tasks (id),
  inspected_at timestamptz not null default now(),
  inspector_id uuid        not null references public.profiles (id),
  status       text        not null default 'IN_PROGRESS'
                           check (status in ('IN_PROGRESS', 'DONE')),
  note         text,
  created_at   timestamptz not null default now()
);

comment on table public.inspection_runs is '점검 실행 이력';

create index on public.inspection_items (template_id, seq);
create index on public.inspection_runs (site_id, inspected_at desc);
create index on public.inspection_runs (inspected_at desc);

-- =============================================================================
-- 4. 이슈
-- =============================================================================

create table public.issues (
  id            bigint generated always as identity primary key,
  no            text        not null unique,           -- 화면 표시용 번호 2026-0001
  site_id       bigint      not null references public.sites (id),
  task_id       bigint      references public.tasks (id),
  type_id       bigint      references public.issue_types (id),
  title         text        not null check (length(btrim(title)) > 0),
  symptom       text        not null default '',
  severity      text        not null default 'MEDIUM'
                            check (severity in ('HIGH', 'MEDIUM', 'LOW')),
  status        text        not null default 'RECEIVED'
                            check (status in ('RECEIVED', 'IN_PROGRESS', 'ACTION_DONE',
                                              'CLOSED', 'ON_HOLD')),
  occurred_at   timestamptz not null default now(),
  closed_at     timestamptz,
  reporter_id   uuid        not null references public.profiles (id),
  assignee_id   uuid        references public.profiles (id),
  source_run_id bigint      references public.inspection_runs (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on column public.issues.source_run_id is '정기점검에서 전환된 이슈인 경우 그 점검 이력';

create index on public.issues (occurred_at desc);
create index on public.issues (site_id, occurred_at desc);
create index on public.issues (status);
create index on public.issues (assignee_id);
create index on public.issues (type_id);
create index on public.issues (source_run_id);

-- 제목·증상 부분일치 검색용 (유사이슈 검색에서 LIKE 를 쓴다)
create extension if not exists pg_trgm;
create index issues_title_trgm   on public.issues using gin (lower(title) gin_trgm_ops);
create index issues_symptom_trgm on public.issues using gin (lower(symptom) gin_trgm_ops);

-- 이슈 ↔ 태그
create table public.issue_tags (
  issue_id bigint not null references public.issues (id) on delete cascade,
  tag_id   bigint not null references public.tags (id)   on delete cascade,
  primary key (issue_id, tag_id)
);

create index on public.issue_tags (tag_id);

-- -----------------------------------------------------------------------------
-- 처리 이력 (조치사항)
--   이슈 한 건에 날짜별로 여러 건 쌓인다.
--   해결한 것만이 아니라 "아직 처리 못한 경과"도 한 줄로 남긴다 (result = UNRESOLVED).
--   issue_id 하나로 원천 이슈와 연결되며, 그 외의 연결관계는 두지 않는다.
-- -----------------------------------------------------------------------------

create table public.actions (
  id         bigint generated always as identity primary key,
  issue_id   bigint      not null references public.issues (id) on delete cascade,
  acted_at   timestamptz not null default now(),       -- 처리일자
  actor_id   uuid        not null references public.profiles (id),
  content    text        not null check (length(btrim(content)) > 0),
  result     text        not null default 'RESOLVED'
                         check (result in ('RESOLVED', 'TEMPORARY', 'UNRESOLVED')),
  created_at timestamptz not null default now()
);

comment on table public.actions is '이슈 한 건에 대한 날짜별 처리 이력';

create index on public.actions (issue_id, acted_at);

-- 점검 결과 (issues 를 참조하므로 issues 뒤에 만든다)
create table public.inspection_results (
  id       bigint generated always as identity primary key,
  run_id   bigint not null references public.inspection_runs (id) on delete cascade,
  item_id  bigint references public.inspection_items (id) on delete set null,
  content  text   not null,                            -- 점검 당시 항목 문구를 복사 보관
  result   text   not null default 'OK' check (result in ('OK', 'NG', 'NA')),
  comment  text,
  issue_id bigint references public.issues (id) on delete set null,
  seq      int    not null default 0
);

comment on column public.inspection_results.content is
  '템플릿이 나중에 바뀌어도 당시 점검 내용이 남도록 항목 문구를 복사해 저장';
comment on column public.inspection_results.issue_id is
  '이상(NG) 발견 후 이슈로 전환한 경우 그 이슈';

create index on public.inspection_results (run_id, seq);
create index on public.inspection_results (issue_id);

-- =============================================================================
-- 5. 첨부파일
--    실제 파일은 Storage 버킷에, 메타데이터만 여기에 둔다.
--    이슈 / 처리이력 / 점검이력 중 정확히 하나에만 붙는다.
-- =============================================================================

create table public.attachments (
  id           bigint generated always as identity primary key,
  issue_id     bigint references public.issues (id)          on delete cascade,
  action_id    bigint references public.actions (id)         on delete cascade,
  run_id       bigint references public.inspection_runs (id) on delete cascade,
  file_name    text   not null,
  storage_path text   not null unique,
  content_type text   not null default 'application/octet-stream',
  size         bigint not null default 0,
  uploaded_by  uuid   not null references public.profiles (id),
  created_at   timestamptz not null default now(),
  constraint attachments_exactly_one_parent check (
    (issue_id is not null)::int + (action_id is not null)::int + (run_id is not null)::int = 1
  )
);

create index on public.attachments (issue_id);
create index on public.attachments (action_id);
create index on public.attachments (run_id);

-- =============================================================================
-- 6. 이슈번호 채번 (연도별 일련번호 2026-0001)
-- =============================================================================

create table public.issue_counters (
  year     int primary key,
  last_seq int not null default 0
);

create or replace function public.next_issue_no(p_when timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from (p_when at time zone 'Asia/Seoul'))::int;
  v_seq  int;
begin
  insert into public.issue_counters as c (year, last_seq)
  values (v_year, 1)
  on conflict (year) do update set last_seq = c.last_seq + 1
  returning c.last_seq into v_seq;

  return v_year::text || '-' || lpad(v_seq::text, 4, '0');
end;
$$;

-- 이슈를 넣을 때 번호가 비어 있으면 자동으로 채운다.
create or replace function public.set_issue_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.no is null or btrim(new.no) = '' then
    new.no := public.next_issue_no(coalesce(new.occurred_at, now()));
  end if;
  return new;
end;
$$;

create trigger trg_issues_set_no
  before insert on public.issues
  for each row execute function public.set_issue_no();

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_issues_touch_updated
  before update on public.issues
  for each row execute function public.touch_updated_at();

-- =============================================================================
-- 7. 유사이슈 검색
--    외부 검색엔진 없이 DB 안에서 점수를 매긴다. 가중치는 prod.md 7.3 참고.
-- =============================================================================

-- 문장에서 검색어(토큰)를 뽑는다. 2글자 이상, 소문자, 불용어 제거.
create or replace function public.tokenize(p_text text)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(distinct s.w), '{}')
  from (
    select lower(m[1]) as w
    from regexp_matches(coalesce(p_text, ''), '[0-9A-Za-z가-힣_]+', 'g') as m
  ) s
  where length(s.w) >= 2
    and s.w not in (
      '오류', '에러', '발생', '문제', '현상', '관련', '확인', '요청', '안됨', '되지',
      '않음', '대한', '경우', '이슈', '증상', '내용', '바랍니다',
      'the', 'and', 'for', 'with', 'error', 'issue'
    );
$$;

create or replace function public.search_similar_issues(
  p_tokens           text[] default '{}',
  p_tags             text[] default '{}',
  p_type_id          bigint default null,
  p_site_id          bigint default null,
  p_exclude_issue_id bigint default null,
  p_limit            int    default 8
)
returns table (
  issue_id            bigint,
  issue_no            text,
  issue_title         text,
  site_name           text,
  task_name           text,
  type_name           text,
  issue_status        text,
  issue_severity      text,
  occurred_at         timestamptz,
  score               int,
  action_count        int,
  last_action_content text,
  last_action_result  text,
  last_action_at      timestamptz
)
language sql
stable
set search_path = public
as $$
  with p as (
    select
      array(select lower(x) from unnest(coalesce(p_tokens, '{}'::text[])) x where length(x) >= 2) as tokens,
      array(select lower(x) from unnest(coalesce(p_tags,   '{}'::text[])) x)                      as tags
  ),
  -- 1) 토큰·유형·태그가 하나라도 걸리는 이슈를 최근 순으로 추린다
  cand as (
    select i.id
    from public.issues i cross join p
    where (p_exclude_issue_id is null or i.id <> p_exclude_issue_id)
      and (
        exists (
          select 1 from unnest(p.tokens) x
          where lower(i.title) like '%' || x || '%'
             or lower(i.symptom) like '%' || x || '%'
        )
        or (p_type_id is not null and i.type_id = p_type_id)
        or exists (
          select 1
          from public.issue_tags it
          join public.tags g on g.id = it.tag_id
          where it.issue_id = i.id and lower(g.name) = any (p.tags)
        )
      )
    order by i.occurred_at desc
    limit 400
  ),
  -- 2) 가중치로 점수를 매긴다
  scored as (
    select
      i.id, i.no, i.title, i.status, i.severity, i.occurred_at,
      s.name  as site_name,
      tk.name as task_name,
      ty.name as type_name,
      (
          3 * (select count(*) from unnest(p.tokens) x where lower(i.title)   like '%' || x || '%')
        + 1 * (select count(*) from unnest(p.tokens) x where lower(i.symptom) like '%' || x || '%')
        + case when p_type_id is not null and i.type_id = p_type_id then 2 else 0 end
        + 2 * (
            select count(*)
            from public.issue_tags it
            join public.tags g on g.id = it.tag_id
            where it.issue_id = i.id and lower(g.name) = any (p.tags)
          )
        -- 타 사이트 사례를 찾는 것이 목적이므로 다른 사이트 이슈를 살짝 우대
        + case when p_site_id is not null and i.site_id <> p_site_id then 1 else 0 end
        -- 참고할 처리 내용이 실제로 있는 이슈
        + case when exists (
            select 1 from public.actions a
            where a.issue_id = i.id and a.result <> 'UNRESOLVED'
          ) then 2 else 0 end
      )::int as score
    from cand c
    join public.issues i       on i.id  = c.id
    join public.sites  s       on s.id  = i.site_id
    left join public.tasks tk  on tk.id = i.task_id
    left join public.issue_types ty on ty.id = i.type_id
    cross join p
  )
  select
    sc.id, sc.no, sc.title, sc.site_name, sc.task_name, sc.type_name,
    sc.status, sc.severity, sc.occurred_at, sc.score,
    (select count(*)::int from public.actions a where a.issue_id = sc.id),
    la.content, la.result, la.acted_at
  from scored sc
  left join lateral (
    select a.content, a.result, a.acted_at
    from public.actions a
    where a.issue_id = sc.id
    -- 해결/임시조치를 미해결보다 먼저, 그 중 최신 것
    order by (a.result <> 'UNRESOLVED') desc, a.acted_at desc, a.id desc
    limit 1
  ) la on true
  where sc.score > 0
  order by sc.score desc, sc.occurred_at desc
  limit greatest(coalesce(p_limit, 8), 1);
$$;

comment on function public.search_similar_issues is
  '유사이슈 검색. 제목 매칭 3점, 증상 1점, 같은 유형 2점, 태그 일치 2점/건, 타 사이트 1점, 처리이력 보유 2점';

-- =============================================================================
-- 8. RLS (Row Level Security)
--
--   기본 방침
--     조회 — 활성 사용자는 전부 볼 수 있다. 사이트 간 사례 공유가 목적이라 가리지 않는다.
--     등록·수정 — 활성 사용자
--     삭제 — 작성자 본인 또는 관리자
--     마스터 — 관리자만 변경
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.sites                enable row level security;
alter table public.tasks                enable row level security;
alter table public.issue_types          enable row level security;
alter table public.tags                 enable row level security;
alter table public.issues               enable row level security;
alter table public.issue_tags           enable row level security;
alter table public.actions              enable row level security;
alter table public.attachments          enable row level security;
alter table public.inspection_templates enable row level security;
alter table public.inspection_items     enable row level security;
alter table public.inspection_runs      enable row level security;
alter table public.inspection_results   enable row level security;
alter table public.issue_counters       enable row level security;

-- ---- profiles ---------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated using (public.is_active_user());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy profiles_insert_admin on public.profiles
  for insert to authenticated with check (public.is_admin());

create policy profiles_delete_admin on public.profiles
  for delete to authenticated using (public.is_admin());

-- ---- 마스터: 조회는 모두, 변경은 관리자 --------------------------------------
create policy sites_select on public.sites
  for select to authenticated using (public.is_active_user());
create policy sites_write on public.sites
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy tasks_select on public.tasks
  for select to authenticated using (public.is_active_user());
create policy tasks_write on public.tasks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy issue_types_select on public.issue_types
  for select to authenticated using (public.is_active_user());
create policy issue_types_write on public.issue_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy templates_select on public.inspection_templates
  for select to authenticated using (public.is_active_user());
create policy templates_write on public.inspection_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy items_select on public.inspection_items
  for select to authenticated using (public.is_active_user());
create policy items_write on public.inspection_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- 태그: 이슈 등록 중에 새로 만들어질 수 있으므로 활성 사용자가 생성 가능 ----
create policy tags_select on public.tags
  for select to authenticated using (public.is_active_user());
create policy tags_insert on public.tags
  for insert to authenticated with check (public.is_active_user());
create policy tags_delete_admin on public.tags
  for delete to authenticated using (public.is_admin());

-- ---- 이슈 -------------------------------------------------------------------
create policy issues_select on public.issues
  for select to authenticated using (public.is_active_user());

create policy issues_insert on public.issues
  for insert to authenticated
  with check (public.is_active_user() and reporter_id = auth.uid());

create policy issues_update on public.issues
  for update to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

create policy issues_delete on public.issues
  for delete to authenticated
  using (reporter_id = auth.uid() or public.is_admin());

-- ---- 이슈 태그 ---------------------------------------------------------------
create policy issue_tags_select on public.issue_tags
  for select to authenticated using (public.is_active_user());
create policy issue_tags_write on public.issue_tags
  for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- ---- 처리 이력 ---------------------------------------------------------------
create policy actions_select on public.actions
  for select to authenticated using (public.is_active_user());

create policy actions_insert on public.actions
  for insert to authenticated
  with check (public.is_active_user() and actor_id = auth.uid());

create policy actions_update on public.actions
  for update to authenticated
  using (actor_id = auth.uid() or public.is_admin())
  with check (actor_id = auth.uid() or public.is_admin());

create policy actions_delete on public.actions
  for delete to authenticated
  using (actor_id = auth.uid() or public.is_admin());

-- ---- 첨부파일 ---------------------------------------------------------------
create policy attachments_select on public.attachments
  for select to authenticated using (public.is_active_user());

create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (public.is_active_user() and uploaded_by = auth.uid());

create policy attachments_delete on public.attachments
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());

-- ---- 정기점검 실행 / 결과 ----------------------------------------------------
create policy runs_select on public.inspection_runs
  for select to authenticated using (public.is_active_user());

create policy runs_insert on public.inspection_runs
  for insert to authenticated
  with check (public.is_active_user() and inspector_id = auth.uid());

create policy runs_update on public.inspection_runs
  for update to authenticated
  using (inspector_id = auth.uid() or public.is_admin())
  with check (inspector_id = auth.uid() or public.is_admin());

create policy runs_delete on public.inspection_runs
  for delete to authenticated
  using (inspector_id = auth.uid() or public.is_admin());

create policy results_select on public.inspection_results
  for select to authenticated using (public.is_active_user());

create policy results_write on public.inspection_results
  for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- ---- 채번 테이블: 직접 건드릴 일 없음 (트리거가 security definer 로 처리) ----
create policy counters_select on public.issue_counters
  for select to authenticated using (public.is_active_user());

-- =============================================================================
-- 9. Storage — 첨부파일 버킷
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy attachments_object_select on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.is_active_user());

create policy attachments_object_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_active_user());

create policy attachments_object_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (owner = auth.uid() or public.is_admin()));
