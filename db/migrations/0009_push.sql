-- VITRINE: web push. Devices that asked for notifications, and what has been sent.

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- One row per notification sent, so the same one never goes out twice.
create table public.push_log (
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key      text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_subscriptions enable row level security;
alter table public.push_log enable row level security;

create policy "own rows" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.push_log for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.push_subscriptions, public.push_log from anon;
grant select, insert, update, delete on public.push_subscriptions, public.push_log to authenticated;
grant all on public.push_subscriptions, public.push_log to service_role;
