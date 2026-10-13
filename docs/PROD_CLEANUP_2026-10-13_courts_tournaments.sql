-- ============================================================================
-- PROD 정리: 입점 코트 4곳 + 대회 2건 삭제 (2026-10-13 조사 기준)
-- 대상: 운영 Supabase (jbvtdthtmrlndduqiikj) — SQL Editor 에 이 파일 전체를 붙여 넣고 실행
--
-- ⚠️ 되돌릴 수 없다. 실행 전 백업: outputs/prod-backup-2026-10-13/courts_tournaments_before_delete.json
--    (지워질 행 전체를 내려받아 둔 것. git 에는 올라가지 않는 폴더)
--
-- 지워지는 것 (2026-10-13 운영 DB 조회 결과):
--   · 코트 4곳 — 모두 2026-07-11 에 넣은 데모(담당자 없음, 사진 없음)
--       올림픽공원 피클볼장 / 한강 피클볼 센터 / 분당 스포츠파크 / 송도 커뮤니티 코트
--     함께 지워지는 행(FK cascade):
--       court_reservations 29건(전부 지난 날짜, 앞으로의 예약 0건)
--       payments 20건 — mock 결제 4건 + 토스 테스트 키 결제 16건(paid 6·refunded 2·canceled 4·pending 4).
--         마지막 결제일이 2026-09-10 으로 라이브 키 전환(2026-09-16) 전이고, 결제키가 전부 mock_/tviva(테스트)로 시작한다.
--         → 실제 돈이 오간 결제는 없다. 그래도 결제 "기록"은 사라지니, 남겨야 하면 실행하지 말 것.
--       court_open_days·court_blocks·court_reviews 0건
--   · 대회 2건 — 모두 2026-07-11 에 '관리자'가 만든 데모
--       피넛 오픈 단식 대회(진행 중, 참가 7·경기 6) / 주말 복식 리그(접수 중, 참가 1, 참가비 결제 0건)
--     함께 지워지는 행: tournament_entries 8, tournament_matches 6, tournament_courts 4
--
-- 지워지지 않는 것: 회원·클럽·번개·알림(이 코트·대회를 가리키는 알림 0건)·감사 로그.
--   대회·참가·경기 삭제는 감사 로그에 기록된다(행위자 없음 = SQL 직접 실행).
--
-- 안전장치: 아래 조건 중 하나라도 어긋나면 아무것도 지우지 않고 멈춘다(전체가 한 트랜잭션).
--   · 코트가 정확히 이 4곳, 대회가 정확히 이 2건일 것(조사 뒤에 새로 등록된 것이 있으면 멈춤)
--   · 라이브 전환(2026-09-16) 뒤에 결제된 건, 테스트가 아닌 결제키, 대회 참가비 결제가 없을 것
--   · 오늘 이후 날짜의 예약이 없을 것
--
-- 순서 주의: 대회는 "대회 행"을 지워 참가 행이 따라 지워지게 한다. 참가 행을 먼저 지우면
--   대기열 승격 트리거가 돌아 회원에게 푸시가 갈 수 있다(DEV 예행연습에서 대회 행 삭제 시 알림 0건 확인).
--
-- 실행 뒤 화면: 앱의 코트 탭·홈 "오늘 둘러보기"·대회 목록이 빈 상태로 보인다.
--   ⚠️ 스토어 심사 중이면 심사자가 코트 예약·결제를 시연할 코트가 없어진다 — 4.1.0 심사 전에 실행한다면 감안할 것.
-- ============================================================================

begin;

do $$
declare
  v_courts constant uuid[] := array[
    '6fcfb290-b930-4087-8d8c-fd1271a35b79',  -- 올림픽공원 피클볼장
    '15dadd83-7312-49ed-b0ba-ccaf6af6ba0b',  -- 한강 피클볼 센터
    '08dd2c1d-fcc4-4851-a203-4e796754aea2',  -- 분당 스포츠파크
    '58b7b7ba-058b-44bc-bd43-32693eb21b28'   -- 송도 커뮤니티 코트
  ]::uuid[];
  v_tournaments constant uuid[] := array[
    '864d5a25-e09c-4b34-9279-b09a9ae46c25',  -- 피넛 오픈 단식 대회 (진행 중)
    '520353a6-e4f9-4131-8fa1-9636af2e7dbf'   -- 주말 복식 리그 (접수 중)
  ]::uuid[];
  n int;
begin
  -- ── 안전장치 ──────────
  if exists (select 1 from public.courts where name = '검단 실내 피클볼장') then
    raise exception '개발 DB 로 보입니다 — 운영 DB 에서만 실행하세요.';
  end if;

  select count(*) into n from public.courts;
  if n <> 4 or (select count(*) from public.courts where id = any (v_courts)) <> 4 then
    raise exception '코트가 조사 때와 다릅니다(지금 %곳) — 새로 등록된 코트가 있는지 확인하세요.', n;
  end if;

  select count(*) into n from public.tournaments;
  if n <> 2 or (select count(*) from public.tournaments where id = any (v_tournaments)) <> 2 then
    raise exception '대회가 조사 때와 다릅니다(지금 %건) — 새로 만든 대회가 있는지 확인하세요.', n;
  end if;

  if exists (
    select 1 from public.payments p
     where (p.court_id = any (v_courts) or (p.order_type = 'tournament' and p.target_id = any (v_tournaments)))
       and p.status in ('paid', 'refunded')
       and (p.paid_at >= timestamptz '2026-09-16 00:00+09'
            or coalesce(p.provider_tx, '') !~ '^(mock_|tviva)')
  ) then
    raise exception '실결제로 보이는 결제 기록이 있습니다 — 삭제하지 않고 멈춥니다.';
  end if;

  if exists (select 1 from public.payments p where p.order_type = 'tournament' and p.target_id = any (v_tournaments)) then
    raise exception '대회 참가비 결제 기록이 있습니다 — 삭제하지 않고 멈춥니다.';
  end if;

  if exists (
    select 1 from public.court_reservations r
     where r.court_id = any (v_courts) and r.slot_date >= (now() at time zone 'Asia/Seoul')::date
  ) then
    raise exception '오늘 이후 날짜의 예약이 있습니다 — 삭제하지 않고 멈춥니다.';
  end if;

  -- ── 삭제 (딸린 행은 FK cascade 로 함께 지워진다) ──────────
  delete from public.tournaments where id = any (v_tournaments);
  delete from public.courts where id = any (v_courts);

  -- ── 결과 확인: 하나라도 남았으면 전부 되돌린다 ──────────
  if exists (select 1 from public.courts)
     or exists (select 1 from public.tournaments)
     or exists (select 1 from public.court_reservations)
     or exists (select 1 from public.tournament_entries)
     or exists (select 1 from public.tournament_matches) then
    raise exception '삭제 뒤에 남은 행이 있습니다 — 전부 되돌립니다.';
  end if;
end $$;

commit;

-- 실행 뒤 확인(모두 0 이어야 한다)
select (select count(*) from public.courts)             as courts,
       (select count(*) from public.court_reservations) as court_reservations,
       (select count(*) from public.payments)           as payments,
       (select count(*) from public.tournaments)        as tournaments,
       (select count(*) from public.tournament_entries) as tournament_entries,
       (select count(*) from public.tournament_matches) as tournament_matches,
       (select count(*) from public.tournament_courts)  as tournament_courts;
