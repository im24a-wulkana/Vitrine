-- VITRINE: calendar. One log per day, with weather and an optional mirror photo.
--
-- wear_logs is what the app writes. The wears table stays as the per-item index
-- that cost per wear and the wear charts read, and triggers keep it in step, so
-- the two can't disagree.

create table public.wear_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  outfit_id   uuid references public.outfits (id) on delete set null,
  item_ids    uuid[] not null default '{}',
  photo_url   text,
  weather     jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);
create index wear_logs_item_ids_idx on public.wear_logs using gin (item_ids);

-- Bring existing wears across before the triggers exist.
insert into public.wear_logs (user_id, date, item_ids)
select i.user_id, w.worn_on, array_agg(w.item_id)
  from public.wears w
  join public.items i on i.id = w.item_id
 group by i.user_id, w.worn_on;

-- Only keeps ids of items the caller can see, so a log can't reference someone
-- else's items, and removes duplicates.
create function public.wear_logs_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.item_ids := array(select i.id from public.items i where i.id = any(new.item_ids));
  return new;
end $$;

create trigger wear_logs_before_write before insert or update of item_ids on public.wear_logs
  for each row execute function public.wear_logs_before_write();

create function public.wear_logs_sync_wears() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.wears w where w.worn_on = old.date and w.item_id = any(old.item_ids);
    return null;
  end if;

  if tg_op = 'UPDATE' then
    delete from public.wears w
     where w.worn_on = old.date and w.item_id = any(old.item_ids)
       and (old.date <> new.date or not w.item_id = any(new.item_ids));
  end if;

  insert into public.wears (item_id, worn_on)
  select unnest(new.item_ids), new.date
  on conflict (item_id, worn_on) do nothing;
  return null;
end $$;

create trigger wear_logs_sync_wears after insert or update or delete on public.wear_logs
  for each row execute function public.wear_logs_sync_wears();

-- A deleted item leaves its logs. A log with nothing left in it goes too.
create function public.items_after_delete_logs() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.wear_logs set item_ids = array_remove(item_ids, old.id) where item_ids @> array[old.id];
  delete from public.wear_logs
   where user_id = old.user_id and cardinality(item_ids) = 0 and photo_url is null and outfit_id is null;
  return null;
end $$;

create trigger items_after_delete_logs after delete on public.items
  for each row execute function public.items_after_delete_logs();

alter table public.wear_logs enable row level security;

create policy "own rows" on public.wear_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- A log can only point at the caller's own outfit.
create policy "own outfit" on public.wear_logs as restrictive for all to authenticated
  using (true)
  with check (outfit_id is null or exists (select 1 from public.outfits o where o.id = outfit_id));

revoke all on public.wear_logs from anon;
grant select, insert, update, delete on public.wear_logs to authenticated;
grant all on public.wear_logs to service_role;

alter table public.user_settings
  add column city text,
  add column lat double precision check (lat between -90 and 90),
  add column lon double precision check (lon between -180 and 180),
  add column theme text check (theme in ('dark', 'light'));
