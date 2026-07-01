---
name: add-supabase-table
description: 피클 앱에 새 Supabase 테이블을 끝까지 추가한다 — schema.sql, 번호순 마이그레이션, RLS 정책, 그리고 src/lib/types.ts 의 매칭 타입까지. 새 DB 엔티티(clubs, matches, messages 등)를 도입할 때 사용.
---

# Supabase 테이블 추가 (피클 앱)

새 테이블은 **항상 4가지를 함께** 작업한다. 하나라도 빠지면 타입이 깨지거나 RLS 로 막힌다.

## 1) `supabase/schema.sql` 에 테이블 추가
```sql
create table if not exists public.<table> (
  id          uuid primary key default uuid_generate_v4(),
  -- ... 컬럼들 ...
  created_at  timestamptz not null default now()
);
```
인덱스가 필요하면 `create index if not exists ...` 도 추가.

## 2) RLS 정책 (필수 — 이 앱의 기본 원칙: 조회 공개, 쓰기 본인만)
```sql
alter table public.<table> enable row level security;

drop policy if exists "<table>_select" on public.<table>;
create policy "<table>_select" on public.<table> for select using (true);

drop policy if exists "<table>_insert_self" on public.<table>;
create policy "<table>_insert_self" on public.<table>
  for insert with check (auth.uid() = <owner_col>);

drop policy if exists "<table>_update_self" on public.<table>;
create policy "<table>_update_self" on public.<table>
  for update using (auth.uid() = <owner_col>);
```

## 3) `supabase/migrations/NNNN_<name>.sql` 추가
이미 schema.sql 을 실행한 사용자를 위해 같은 변경을 **idempotent**하게:
```sql
create table if not exists public.<table> ( ... );
alter table public.<table> enable row level security;
-- 위 정책들 (drop policy if exists → create policy)
```
번호(NNNN)는 기존 최대값 +1.

## 4) `src/lib/types.ts` 갱신 — 가장 실수 잦은 부분
- 도메인 타입은 **반드시 `type` 별칭** (interface 금지!). interface 는 Supabase `GenericTable` 제약을 못 맞춰 쿼리 타입이 `never` 가 된다.
```ts
export type <Entity> = {
  id: string;
  // ... 컬럼과 1:1, nullable 은 `| null`
  created_at: string;
};
```
- `Database` 인터페이스의 `Tables` 에 항목 추가 (Insert/Update + **`Relationships: []`** 포함):
```ts
<table>: {
  Row: <Entity>;
  Insert: Partial<<Entity>> & { /* 필수 컬럼 */ };
  Update: Partial<<Entity>>;
  Relationships: [];
};
```

## 5) 검증
- Supabase SQL Editor 에 마이그레이션 실행.
- `npx tsc --noEmit` + `npx expo lint` 통과.
- 트리거로 자동 생성되는 행이면(예: profiles) 앱에서 직접 insert 하지 말 것.
