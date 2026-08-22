-- Phase 1: 개인별 링크(ref) 24시간 만료.
-- 입력 금액·개인 식별정보는 넣지 않는다.
--
-- 보안: anon/authenticated는 테이블 직접 SELECT/INSERT/UPDATE 불가.
-- ref 최초 열림·만료 판정은 SECURITY DEFINER RPC `claim_campaign_link`만 사용.
-- 링크 발급(INSERT)은 service role / SQL 에디터(관리자)만.

create table if not exists campaign_links (
  ref             text primary key,
  first_opened_at timestamptz,
  label           text
);

alter table campaign_links enable row level security;

-- 기존 개방형 정책 제거 (재적용 시에도 안전)
drop policy if exists "select own ref" on campaign_links;
drop policy if exists "insert own ref" on campaign_links;
drop policy if exists "update own ref" on campaign_links;

-- 테이블 직접 접근 전면 차단 (RPC만 허용)
revoke all on table campaign_links from anon, authenticated;
revoke all on table campaign_links from public;

-- 관리자 발급 예시 (SQL Editor / service role):
--   insert into campaign_links (ref, label) values ('A8F2K', '배우 A / 1차 컨택');

create or replace function public.claim_campaign_link(
  p_ref text,
  p_expiry_hours integer default 24
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
  v_opened timestamptz;
  v_now timestamptz := timezone('utc', now());
  v_hours integer;
begin
  v_ref := nullif(trim(coalesce(p_ref, '')), '');
  if v_ref is null then
    return 'unavailable';
  end if;

  v_hours := coalesce(p_expiry_hours, 24);
  if v_hours < 1 then
    v_hours := 1;
  end if;

  select cl.ref, cl.first_opened_at
    into v_ref, v_opened
  from campaign_links cl
  where cl.ref = v_ref
  for update;

  if not found then
    return 'unavailable';
  end if;

  if v_opened is null then
    update campaign_links
       set first_opened_at = v_now
     where ref = v_ref;
    return 'valid';
  end if;

  -- 파싱 불능·미래 시각 등은 유효로 보지 않음
  if v_opened > v_now then
    return 'unavailable';
  end if;

  if (v_now - v_opened) > make_interval(hours => v_hours) then
    return 'expired';
  end if;

  return 'valid';
end;
$$;

revoke all on function public.claim_campaign_link(text, integer) from public;
grant execute on function public.claim_campaign_link(text, integer) to anon, authenticated;

comment on function public.claim_campaign_link(text, integer) is
  '캠페인 ref 최초 열림 기록 및 만료 판정. 반환: valid | expired | unavailable. 클라이언트는 테이블 직접 갱신 금지.';

-- 운영: landing/js/campaign-config.js 에 url/anonKey, enabled:true
-- 클라이언트는 db.rpc('claim_campaign_link', { p_ref, p_expiry_hours }) 만 호출한다.
