-- 0090: 복식 파트너 추후 등록·변경 + "모든 알림은 푸시로" 보장
--   · 파트너 없이 신청 허용(앱), 신청 후 파트너 등록/변경/해제 가능 → 중복 검사를 UPDATE 에도 적용
--   · notifications AFTER INSERT 트리거가 Expo 푸시를 전담 — 어떤 경로로 알림이 쌓여도 푸시 발송(정책: 모든 알림=푸시)
--   · push_notify() 는 행 저장만 하도록 슬림화(트리거와 중복 발송 방지), 0089 승격/만료 알림도 push_notify 로 통일

-- (A) 중복 참가 검사 확장 (0013 대체) — partner_id UPDATE 시에도 검사, 자기 행은 제외
create or replace function public.enforce_no_double_entry()
returns trigger
language plpgsql
as $$
begin
  if new.partner_id is not null and new.partner_id = new.user_id then
    raise exception '본인을 파트너로 지정할 수 없어요.';
  end if;
  if tg_op = 'INSERT' and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and (e.user_id = new.user_id or e.partner_id = new.user_id)
  ) then
    raise exception '이미 이 대회에 참가 신청되어 있어요.';
  end if;
  if new.partner_id is not null and exists (
    select 1 from public.tournament_entries e
    where e.tournament_id = new.tournament_id
      and e.user_id <> new.user_id -- 내 행(변경 대상)은 제외
      and (e.user_id = new.partner_id or e.partner_id = new.partner_id)
  ) then
    raise exception '선택한 파트너는 이미 이 대회에 참가 중이에요.';
  end if;
  return new;
end;
$$;
drop trigger if exists on_no_double_entry on public.tournament_entries;
create trigger on_no_double_entry
  before insert or update of partner_id on public.tournament_entries
  for each row execute function public.enforce_no_double_entry();

-- (B) 대기열 승격 알림 → push_notify (0089 promote_waitlist 대체)
create or replace function public.promote_waitlist()
returns trigger
language plpgsql
security definer
as $$
declare
  cap int;
  vfee int;
  vtitle text;
  occupied int;
  tid uuid;
  nextw uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  tid := coalesce(new.tournament_id, old.tournament_id);
  select max_participants, fee, title into cap, vfee, vtitle from public.tournaments where id = tid;
  if cap is null then
    return null;
  end if;
  loop
    select count(*) into occupied from public.tournament_entries
      where tournament_id = tid and status in ('pending', 'approved');
    exit when occupied >= cap;
    select user_id into nextw from public.tournament_entries
      where tournament_id = tid and status = 'waitlist'
      order by created_at asc
      limit 1;
    exit when nextw is null;
    if coalesce(vfee, 0) > 0 then
      update public.tournament_entries
        set status = 'pending', payment_deadline = now() + interval '24 hours'
        where tournament_id = tid and user_id = nextw;
      perform public.push_notify(
        nextw, 'system', '대기열 승격 🎉',
        coalesce(vtitle, '대회') || ' 자리가 났어요! 24시간 안에 참가비를 결제하면 참가가 확정됩니다.',
        'tournament', tid);
    else
      update public.tournament_entries
        set status = 'approved'
        where tournament_id = tid and user_id = nextw;
      perform public.push_notify(
        nextw, 'system', '참가 확정 🎉',
        coalesce(vtitle, '대회') || ' 대기열에서 승격되어 참가가 확정됐어요.',
        'tournament', tid);
    end if;
  end loop;
  return null;
end;
$$;

-- (C) 결제 기한 만료 정리도 push_notify 로 (0089 expire 대체)
create or replace function public.expire_unpaid_tournament_entries(p_tournament_id uuid default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_count int := 0;
  v record;
begin
  for v in
    select e.tournament_id, e.user_id
    from public.tournament_entries e
    join public.tournaments t on t.id = e.tournament_id
    where t.fee > 0
      and e.status = 'pending'
      and e.paid_at is null
      and e.payment_deadline is not null
      and e.payment_deadline < now()
      and (p_tournament_id is null or e.tournament_id = p_tournament_id)
  loop
    delete from public.tournament_entries
      where tournament_id = v.tournament_id and user_id = v.user_id;
    perform public.push_notify(
      v.user_id, 'system', '대회 신청 만료',
      '결제 기한(24시간)이 지나 참가 신청이 자동 취소됐어요. 자리가 남아 있으면 다시 신청할 수 있어요.',
      'tournament', v.tournament_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- (D) "모든 알림은 푸시로" — notifications insert 시 트리거가 Expo 푸시를 전담
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_token text;
begin
  select push_token into v_token from public.profiles where id = new.user_id;
  if v_token is null or v_token = '' then return null; end if;
  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
      'to', v_token,
      'sound', 'default',
      'title', new.title,
      'body', new.body,
      'data', jsonb_build_object('target_type', new.target_type, 'target_id', new.target_id)
    )
  );
  return null;
end;
$$;
drop trigger if exists on_notification_push on public.notifications;
create trigger on_notification_push
  after insert on public.notifications
  for each row execute function public.push_on_notification();

-- (E) push_notify() 슬림화 — 행 저장만(푸시는 위 트리거가 발송, 중복 방지)
create or replace function public.push_notify(
  p_user        uuid,
  p_type        text,
  p_title       text,
  p_body        text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_actor       uuid default null
) returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if p_user is null then return; end if;
  -- 내가 유발한 알림은 나에게 보내지 않음 (내 글에 내가 댓글 등)
  if p_actor is not null and p_actor = p_user then return; end if;
  insert into public.notifications (user_id, type, title, body, target_type, target_id, actor_id)
  values (p_user, p_type, p_title, p_body, p_target_type, p_target_id, p_actor);
end;
$$;
