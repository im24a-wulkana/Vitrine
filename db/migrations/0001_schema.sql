-- VITRINE: core schema.
--
-- Invariants enforced in this database, not in the app:
--   * items.status = 'sold' if and only if the item has a row in sales.
--   * items.status = 'listed' if and only if the item has an open listing.
--   * items.buy_price_chf always equals buy_price when buy_currency = 'CHF'.
--   * sales.item_cost_chf always mirrors items.buy_price_chf.
--   * Every list_price change on a listing writes a price_changes row.

create type public.item_status as enum ('personal', 'in_stock', 'listed', 'sold');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand          text not null check (length(trim(brand)) > 0),
  name           text not null check (length(trim(name)) > 0),
  category       text,
  size           text,
  color          text,
  condition      smallint check (condition between 1 and 10),
  status         public.item_status not null default 'in_stock',
  buy_price      numeric(12, 2) not null default 0 check (buy_price >= 0),
  buy_currency   text not null default 'CHF' check (buy_currency ~ '^[A-Z]{3}$'),
  buy_price_chf  numeric(12, 2) not null default 0 check (buy_price_chf >= 0),
  buy_date       date,
  buy_source     text,
  notes          text,
  tags           text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index items_user_status_idx on public.items (user_id, status);
create index items_user_created_idx on public.items (user_id, created_at desc);
create index items_tags_idx on public.items using gin (tags);

create table public.item_images (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  url         text not null,
  is_primary  boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index item_images_item_idx on public.item_images (item_id, position);
create unique index item_images_one_primary_idx on public.item_images (item_id) where is_primary;

-- platform is stored as text, not a foreign key, so that renaming or deleting
-- a platform in settings cannot rewrite sales history.
create table public.listings (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  platform     text not null default 'Unspecified',
  list_price   numeric(12, 2) check (list_price >= 0),
  listed_at    timestamptz not null default now(),
  delisted_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index listings_item_idx on public.listings (item_id);
create index listings_open_idx on public.listings (item_id) where delisted_at is null;

create table public.price_changes (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  old_price   numeric(12, 2) not null,
  new_price   numeric(12, 2) not null,
  changed_at  timestamptz not null default now()
);
create index price_changes_listing_idx on public.price_changes (listing_id, changed_at desc);

-- A generated column cannot read another table, so net_profit cannot refer to
-- items.buy_price_chf directly. item_cost_chf is a copy of it, kept in sync by
-- the triggers below, and net_profit is generated from that copy.
create table public.sales (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null unique references public.items (id) on delete cascade,
  platform       text not null,
  sale_price     numeric(12, 2) not null check (sale_price >= 0),
  fees           numeric(12, 2) not null default 0 check (fees >= 0),
  shipping_cost  numeric(12, 2) not null default 0 check (shipping_cost >= 0),
  item_cost_chf  numeric(12, 2) not null default 0,
  sold_at        date not null default current_date,
  net_profit     numeric(12, 2) generated always as
                   (sale_price - fees - shipping_cost - item_cost_chf) stored,
  created_at     timestamptz not null default now()
);
create index sales_sold_at_idx on public.sales (sold_at desc);

create table public.platforms (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  fee_percent  numeric(5, 2) not null default 0 check (fee_percent between 0 and 100),
  fee_fixed    numeric(12, 2) not null default 0 check (fee_fixed >= 0),
  created_at   timestamptz not null default now(),
  unique (user_id, name)
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category    text not null,
  amount_chf  numeric(12, 2) not null check (amount_chf >= 0),
  date        date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index expenses_user_date_idx on public.expenses (user_id, date desc);

create table public.wears (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.items (id) on delete cascade,
  worn_on     date not null default current_date,
  created_at  timestamptz not null default now(),
  -- One wear per day keeps a double tap from inflating cost per wear.
  unique (item_id, worn_on)
);

create table public.outfits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now()
);
create index outfits_user_idx on public.outfits (user_id);

create table public.outfit_items (
  outfit_id  uuid not null references public.outfits (id) on delete cascade,
  item_id    uuid not null references public.items (id) on delete cascade,
  position   integer not null default 0,
  primary key (outfit_id, item_id)
);
create index outfit_items_item_idx on public.outfit_items (item_id);

create table public.wishlist (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  brand         text,
  name          text not null check (length(trim(name)) > 0),
  target_price  numeric(12, 2) check (target_price >= 0),
  link          text,
  notes         text,
  created_at    timestamptz not null default now()
);
create index wishlist_user_idx on public.wishlist (user_id);

create table public.user_settings (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_currency      text not null default 'CHF' check (default_currency ~ '^[A-Z]{3}$'),
  aging_threshold_days  integer not null default 30 check (aging_threshold_days > 0),
  markdown_percent      numeric(5, 2) not null default 10 check (markdown_percent > 0 and markdown_percent < 100),
  updated_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Item triggers
-- ---------------------------------------------------------------------------

create function public.items_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.buy_currency = 'CHF' then
    new.buy_price_chf := new.buy_price;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'sold' then
      raise exception 'Create the item first, then record a sale to mark it sold'
        using errcode = 'check_violation';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'sold'
       and not exists (select 1 from public.sales s where s.item_id = new.id) then
      raise exception 'An item can only be marked sold by recording a sale'
        using errcode = 'check_violation';
    end if;
    if old.status = 'sold'
       and exists (select 1 from public.sales s where s.item_id = new.id) then
      raise exception 'Delete the sale before changing the status of a sold item'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

create function public.items_after_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'listed'
     and not exists (select 1 from public.listings l
                     where l.item_id = new.id and l.delisted_at is null) then
    insert into public.listings (item_id) values (new.id);
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'listed' and new.status <> 'listed' then
      update public.listings set delisted_at = now()
       where item_id = new.id and delisted_at is null;
    end if;
    if new.buy_price_chf is distinct from old.buy_price_chf then
      update public.sales set item_cost_chf = new.buy_price_chf where item_id = new.id;
    end if;
  end if;
  return null;
end $$;

create trigger items_after_write after insert or update on public.items
  for each row execute function public.items_after_write();

-- ---------------------------------------------------------------------------
-- Listing triggers
-- ---------------------------------------------------------------------------

create function public.listings_after_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.list_price is distinct from old.list_price
     and old.list_price is not null and new.list_price is not null then
    insert into public.price_changes (listing_id, old_price, new_price)
    values (new.id, old.list_price, new.list_price);
  end if;

  if new.delisted_at is null then
    update public.items set status = 'listed'
     where id = new.item_id and status in ('personal', 'in_stock', 'sold');
  elsif not exists (select 1 from public.listings l
                    where l.item_id = new.item_id and l.delisted_at is null) then
    update public.items set status = 'in_stock'
     where id = new.item_id and status = 'listed';
  end if;
  return null;
end $$;

create trigger listings_after_write after insert or update on public.listings
  for each row execute function public.listings_after_write();

-- ---------------------------------------------------------------------------
-- Sale triggers
-- ---------------------------------------------------------------------------

create function public.sales_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  cost numeric(12, 2);
begin
  select i.buy_price_chf into cost from public.items i where i.id = new.item_id;
  new.item_cost_chf := coalesce(cost, 0);
  return new;
end $$;

create trigger sales_before_write before insert or update of item_id on public.sales
  for each row execute function public.sales_before_write();

create function public.sales_after_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.listings set delisted_at = new.sold_at::timestamptz
   where item_id = new.item_id and delisted_at is null;
  update public.items set status = 'sold' where id = new.item_id;
  return null;
end $$;

create trigger sales_after_insert after insert on public.sales
  for each row execute function public.sales_after_insert();

-- Undoing a sale puts the item back in stock. During a cascading item delete
-- the item row is already gone, so this update matches nothing.
create function public.sales_after_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.items set status = 'in_stock' where id = old.item_id and status = 'sold';
  return null;
end $$;

create trigger sales_after_delete after delete on public.sales
  for each row execute function public.sales_after_delete();

-- ---------------------------------------------------------------------------
-- New user defaults
-- ---------------------------------------------------------------------------

-- Fees start at 0 because the real rates depend on the account and change over
-- time. The user sets them once in Settings.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_settings (user_id) values (new.id);
  insert into public.platforms (user_id, name)
  select new.id, p from unnest(array['Vinted', 'Ricardo', 'Grailed', 'Vestiaire Collective', 'Other']) as p;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
