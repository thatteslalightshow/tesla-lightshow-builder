-- check_rate: shared, cross-instance rate limiter backing src/lib/rate-limit.ts.
--
-- Records the previously unrecorded live function (applied manually in the SQL Editor long
-- before this file; definition confirmed against production via pg_get_functiondef on
-- 2026-07-01) and makes ONE deliberate change: the key is TEXT instead of uuid.
--
-- Why text: signed-in callers pass the auth user id, but /api/track rate-limits by a
-- client-generated anon id — usually UUID-shaped (which uuid coerced fine), with a literal
-- 'anon' fallback when localStorage is blocked. Under the uuid signature that fallback
-- errored, and rateLimitOk fails open on error, so the 'anon' cohort was effectively
-- unlimited. Everything else preserves the live design: sliding window over a rate_events
-- event log (one row per call, counted over the trailing window), 1-day retention sweep.
--
-- Behavior contract (see rateLimitOk): returns TRUE while the caller is at or under p_max
-- calls of p_action within the trailing p_window_seconds; every call logs itself first.

create table if not exists rate_events (
  user_id text        not null,
  action  text        not null,
  at      timestamptz not null default now()
);
create index if not exists rate_events_lookup on rate_events (user_id, action, at);

-- Pre-existing table was keyed by uuid — widen to text (no-op if already text).
alter table rate_events alter column user_id type text using user_id::text;

-- Hardening (new with this record): only the API's service role may log or count events.
-- RLS with no policies locks out client roles; service role bypasses RLS.
alter table rate_events enable row level security;
revoke all on rate_events from anon, authenticated;

-- CREATE OR REPLACE cannot change parameter types, and leaving the uuid version alongside
-- the text one would make the PostgREST rpc name ambiguous — drop it explicitly.
drop function if exists check_rate(uuid, text, integer, integer);

create or replace function check_rate(p_user text, p_action text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare n int;
begin
  insert into rate_events (user_id, action) values (p_user, p_action);
  select count(*) into n from rate_events
    where user_id = p_user and action = p_action and at > now() - make_interval(secs => p_window_seconds);
  delete from rate_events where at < now() - interval '1 day';
  return n <= p_max;
end; $function$;

revoke execute on function check_rate(text, text, integer, integer) from public, anon, authenticated;
grant  execute on function check_rate(text, text, integer, integer) to service_role;
