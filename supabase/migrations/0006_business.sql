-- VITRINE: business extras. Cross-listing reminders, shipping, lots, profit goal.

-- ---------------------------------------------------------------------------
-- Cross-listing: a sale closes every listing in the database, but listings on
-- other platforms are still live until the user takes them down there.
-- ---------------------------------------------------------------------------

alter table public.listings add column needs_delisting boolean not null default false;
create index listings_needs_delisting_idx on public.listings (item_id) where needs_delisting;

create or replace function public.sales_after_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.listings
     set needs_delisting = platform <> new.platform and platform <> 'Unspecified'
   where item_id = new.item_id and delisted_at is null;
  update public.listings set delisted_at = new.sold_at::timestamptz
   where item_id = new.item_id and delisted_at is null;
  update public.items set status = 'sold' where id = new.item_id;
  return null;
end $$;

create or replace function public.sales_after_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.listings set needs_delisting = false where item_id = old.item_id and needs_delisting;
  update public.items set status = 'in_stock' where id = old.item_id and status = 'sold';
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Shipping
-- ---------------------------------------------------------------------------

create type public.shipping_status as enum ('to_ship', 'shipped', 'delivered', 'returned');

alter table public.sales
  add column tracking_number text,
  add column shipping_status public.shipping_status not null default 'to_ship';

-- Sales from before this feature have already gone out.
update public.sales set shipping_status = 'delivered';

create index sales_shipping_idx on public.sales (shipping_status) where shipping_status in ('to_ship', 'shipped');

-- ---------------------------------------------------------------------------
-- Lots: items bought together, with the cost split evenly between them
-- ---------------------------------------------------------------------------

create table public.lots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  total_cost_chf  numeric(12, 2) not null default 0 check (total_cost_chf >= 0),
  bought_at       date,
  source          text,
  created_at      timestamptz not null default now()
);
create index lots_user_idx on public.lots (user_id);

alter table public.items add column lot_id uuid references public.lots (id) on delete set null;
create index items_lot_idx on public.items (lot_id) where lot_id is not null;

-- Any leftover cents go to the oldest items, so the shares always add up exactly.
create function public.split_lot_cost(lot uuid) returns void
language plpgsql set search_path = '' as $$
declare
  total numeric;
  n integer;
  base numeric;
  extra integer;
begin
  select l.total_cost_chf into total from public.lots l where l.id = lot;
  if total is null then return; end if;
  select count(*) into n from public.items i where i.lot_id = lot;
  if n = 0 then return; end if;

  base := floor(total * 100 / n) / 100;
  extra := round((total - base * n) * 100)::integer;

  update public.items i
     set buy_price = s.share, buy_currency = 'CHF', buy_price_chf = s.share
    from (
      select x.id, base + case when row_number() over (order by x.created_at, x.id) <= extra then 0.01 else 0 end as share
        from public.items x where x.lot_id = lot
    ) s
   where i.id = s.id;
end $$;

create function public.items_lot_changed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.lot_id is not null and not exists (select 1 from public.lots l where l.id = new.lot_id) then
    raise exception 'That lot does not exist' using errcode = 'foreign_key_violation';
  end if;
  if new.lot_id is not null then perform public.split_lot_cost(new.lot_id); end if;
  if tg_op = 'UPDATE' and old.lot_id is not null and old.lot_id is distinct from new.lot_id then
    perform public.split_lot_cost(old.lot_id);
  end if;
  return null;
end $$;

create trigger items_lot_changed after insert or update of lot_id on public.items
  for each row execute function public.items_lot_changed();

create function public.lots_after_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform public.split_lot_cost(new.id);
  return null;
end $$;

create trigger lots_after_update after update of total_cost_chf on public.lots
  for each row execute function public.lots_after_update();

alter table public.lots enable row level security;

create policy "own rows" on public.lots for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.lots from anon;
grant select, insert, update, delete on public.lots to authenticated;
grant all on public.lots to service_role;
revoke execute on function public.split_lot_cost(uuid) from public, anon;
grant execute on function public.split_lot_cost(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profit goal
-- ---------------------------------------------------------------------------

alter table public.user_settings
  add column monthly_profit_goal_chf numeric(12, 2) check (monthly_profit_goal_chf >= 0);

-- ---------------------------------------------------------------------------
-- More default platforms, for existing and new accounts
-- ---------------------------------------------------------------------------

insert into public.platforms (user_id, name)
select u.id, p
  from auth.users u
 cross join unnest(array['Tutti', 'Depop', 'Instagram / private']) as p
on conflict (user_id, name) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings (user_id) values (new.id);
  insert into public.platforms (user_id, name)
  select new.id, p
    from unnest(array['Vinted', 'Grailed', 'Ricardo', 'Tutti', 'Depop', 'Vestiaire Collective', 'Instagram / private', 'Other']) as p;
  return new;
end $$;
