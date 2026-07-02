-- 0008: 복식 파트너를 실제 회원(profiles)과 연결
-- 신청 시 파트너 이름으로 회원을 조회해 선택 → partner_id 저장(동명이인 대비).
-- partner_name 은 표시용 스냅샷으로 계속 채운다(비회원/과거 데이터 호환).

alter table public.tournament_entries
  add column if not exists partner_id uuid references public.profiles(id) on delete set null;

create index if not exists tournament_entries_partner_idx
  on public.tournament_entries (partner_id);
