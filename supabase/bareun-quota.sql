-- 원문·키는 저장하지 않습니다. 기존 검사 기록과 정책은 변경하지 않습니다.
begin;
create table if not exists public.bareun_usage (
  period text primary key, calls integer not null default 0, chars integer not null default 0
);
create table if not exists public.bareun_requests (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists bareun_requests_user_time on public.bareun_requests(user_id, created_at desc);
alter table public.bareun_usage enable row level security;
alter table public.bareun_requests enable row level security;
revoke all on public.bareun_usage, public.bareun_requests from public, anon, authenticated;

create or replace function public.reserve_bareun_usage(p_request uuid, p_calls integer, p_chars integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  month_key text := 'm:' || to_char(now() at time zone 'UTC', 'YYYY-MM');
  day_key text := 'd:' || to_char(now() at time zone 'UTC', 'YYYY-MM-DD');
  user_key text;
  monthly public.bareun_usage;
  daily public.bareun_usage;
  personal public.bareun_usage;
begin
  if uid is null or p_request is null or p_calls is null or p_chars is null or
    p_calls not between 1 and 3 or p_chars not between 1 and 3000 then
    return jsonb_build_object('allowed', false);
  end if;
  user_key := 'u:' || uid::text || ':' || day_key;
  insert into public.bareun_usage(period) values(month_key) on conflict do nothing;
  -- 동시 요청도 같은 한도를 공유하도록 월별 행을 먼저 잠급니다.
  select * into monthly from public.bareun_usage where period = month_key for update;
  if exists(select 1 from public.bareun_requests where id = p_request) or
    exists(select 1 from public.bareun_requests where user_id = uid and created_at > now() - interval '1 minute') then
    return jsonb_build_object('allowed', false);
  end if;
  insert into public.bareun_usage(period) values(day_key), (user_key) on conflict do nothing;
  select * into daily from public.bareun_usage where period = day_key;
  select * into personal from public.bareun_usage where period = user_key;
  if monthly.calls + p_calls > 100 or monthly.chars + p_chars > 20000 or
    daily.calls + p_calls > 20 or personal.calls + p_calls > 9 then
    return jsonb_build_object('allowed', false);
  end if;
  insert into public.bareun_requests(id, user_id) values(p_request, uid);
  update public.bareun_usage set calls = calls + p_calls, chars = chars + p_chars
    where period in (month_key, day_key, user_key);
  return jsonb_build_object('allowed', true);
end $$;
revoke all on function public.reserve_bareun_usage(uuid, integer, integer) from public, anon;
grant execute on function public.reserve_bareun_usage(uuid, integer, integer) to authenticated;
commit;
