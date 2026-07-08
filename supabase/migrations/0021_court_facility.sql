-- 0021: 코트 시설 정보 확장 — 면(코트)별 바닥, 편의시설, 레슨 여부
-- court_units: [{ "name": "1", "surface": "hard" }, ...] (면별 바닥 종류가 다를 수 있음)
-- amenities:   {shower, parking, ...} 편의시설 키 배열
-- lessons:     레슨 가능 여부
-- owner_id 는 0018 에 이미 있음(코트관리자 매핑). RLS 도 owner_id 수정 허용 상태.

alter table public.courts add column if not exists court_units jsonb   not null default '[]'::jsonb;
alter table public.courts add column if not exists amenities   text[]  not null default '{}'::text[];
alter table public.courts add column if not exists lessons     boolean not null default false;

-- 쓰기 권한 재정의: 최고관리자는 전체, 코트관리자는 '자기 코트(owner_id=본인)'만.
-- (이전 정책은 아무 court_manager 나 모든 코트를 수정할 수 있었음)
drop policy if exists "courts_facility_write" on public.courts;
create policy "courts_facility_write" on public.courts
  for all using (
    public.my_role() = 'super_admin' or auth.uid() = owner_id
  )
  with check (
    public.my_role() = 'super_admin' or auth.uid() = owner_id
  );
