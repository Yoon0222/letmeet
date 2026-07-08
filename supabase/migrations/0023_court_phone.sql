-- 0023: 코트 연락처(phone) 컬럼 + 기존 description 에 보관된 연락처 이관
-- 0022 시드가 courts.phone 이 없던 시점이라 연락처를 description('연락처 010-...')에 넣어뒀다.
-- 이 마이그레이션에서 phone 컬럼을 추가하고 그 값을 옮긴 뒤 description 을 비운다.

alter table public.courts add column if not exists phone text not null default '';

-- description 이 '연락처 <번호>' 형태인 행만 phone 으로 이관하고 description 을 비운다.
-- (재실행해도 이미 옮긴 행은 description 이 비어 매칭되지 않으므로 안전)
update public.courts
set phone       = trim(regexp_replace(description, '^연락처\s*', '')),
    description = ''
where description ~ '^연락처\s';
