-- 0023: 코트 연락처(phone) 컬럼
alter table public.courts add column if not exists phone text not null default '';
