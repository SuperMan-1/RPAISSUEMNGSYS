-- =============================================================================
-- RPA 이슈관리 — 초기 데이터
--
-- 0001_init.sql 을 먼저 실행한 뒤 이 파일을 SQL Editor 에서 실행한다.
-- 여러 번 실행해도 안전하다 (on conflict do nothing).
--
-- 사이트·과제는 실제 운영 목록이라 여기 넣지 않는다.
-- 앱의 [관리 → 사이트] 화면에서 등록하거나, 맨 아래 예시를 고쳐서 쓴다.
-- =============================================================================

-- 이슈 유형 ------------------------------------------------------------------
insert into public.issue_types (name, sort_order) values
  ('시스템·프로그램 오류', 10),
  ('화면·UI 변경',        20),
  ('네트워크·접속',       30),
  ('권한·인증',           40)
on conflict (name) do nothing;


-- 정기점검 템플릿 (공통) ------------------------------------------------------
-- site_id 가 NULL 이면 모든 사이트에서 쓸 수 있는 공통 템플릿이다.
insert into public.inspection_templates (name, description, site_id)
select '월간 정기점검 (공통)', 'RPA 운영 사이트 월 1회 기본 점검', null
where not exists (
  select 1 from public.inspection_templates where name = '월간 정기점검 (공통)'
);

insert into public.inspection_items (template_id, seq, content, note)
select t.id, v.seq, v.content, v.note
from public.inspection_templates t
cross join (values
  (10, '봇 스케줄이 정상적으로 기동되는지 확인',        '스케줄러 실행 이력 확인'),
  (20, '전월 실행 건 중 실패 건이 있는지 확인',         '실패 건은 이상으로 처리'),
  (30, '대상 사이트 로그인 정상 여부 확인',             '인증서·비밀번호 만료 포함'),
  (40, '인증서 / 비밀번호 만료일 확인',                 '만료 30일 이내면 이상'),
  (50, '처리 결과 파일이 정상 생성되는지 확인',         ''),
  (60, '서버 디스크 여유 공간 확인',                    '20% 미만이면 이상'),
  (70, '로그 파일 정리 상태 확인',                      ''),
  (80, '대상 시스템 화면 변경 여부 확인',               '변경 있으면 이상으로 등록')
) as v(seq, content, note)
where t.name = '월간 정기점검 (공통)'
  and not exists (
    select 1 from public.inspection_items i
    where i.template_id = t.id and i.seq = v.seq
  );


-- =============================================================================
-- 사이트·과제 예시 (필요하면 주석을 풀고 실제 값으로 바꿔 쓴다)
-- =============================================================================
--
-- insert into public.sites (code, name, note, sort_order) values
--   ('AAA', 'A공사',   '월~금 08:00 운영', 10),
--   ('BBB', 'B중공업', '',                 20)
-- on conflict (code) do nothing;
--
-- insert into public.tasks (site_id, code, name, sort_order)
-- select s.id, v.code, v.name, v.sort_order
-- from public.sites s
-- cross join (values
--   ('TAX',   '세금계산서 자동등록', 10),
--   ('CLOSE', '월마감 리포트 생성',  20)
-- ) as v(code, name, sort_order)
-- where s.code = 'AAA'
-- on conflict (site_id, code) do nothing;


-- =============================================================================
-- 첫 관리자 지정
--
-- 가입 화면(/signup)에서 먼저 신청하거나, Supabase 대시보드 →
-- Authentication → Users 에서 계정을 만든 다음, 아래 이메일을 그 계정으로
-- 바꿔 실행하면 관리자 권한이 부여된다.
--
-- 0002_signup.sql 을 적용한 뒤로는 새 계정이 모두 '승인 대기'(is_active = false)
-- 상태로 만들어진다. 첫 관리자는 승인해 줄 사람이 없으므로 여기서 같이 열어 준다.
-- 아이디(username)는 이메일 앞부분으로 자동으로 채워지며, 원하면 같이 바꾼다.
-- =============================================================================
--
-- update public.profiles p
-- set role = 'ADMIN', name = '장도일', is_active = true, username = 'dojang'
-- from auth.users u
-- where u.id = p.id and u.email = 'admin@example.com';
