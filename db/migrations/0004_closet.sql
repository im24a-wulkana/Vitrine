-- VITRINE: closet redesign. Tagging fields on items, and offers.

alter table public.items
  add column subcategory text,
  add column color_primary text check (color_primary ~ '^#[0-9a-fA-F]{6}$'),
  add column colors text[] not null default '{}',
  add column seasons text[] not null default '{}',
  add column occasions text[] not null default '{}',
  add column storage_location text,
  add column measurements jsonb not null default '{}',
  add column favorite boolean not null default false;

create index items_user_favorite_idx on public.items (user_id) where favorite;

-- The closet tabs use a shorter category list. The old value moves to subcategory.
update public.items set subcategory = 'Knitwear', category = 'Tops' where category = 'Knitwear';
update public.items set category = 'Shoes' where category = 'Footwear';
update public.items set subcategory = 'Bags', category = 'Accessories' where category = 'Bags';

create type public.offer_status as enum ('pending', 'accepted', 'declined', 'countered');

create table public.offers (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.items (id) on delete cascade,
  platform_id  uuid references public.platforms (id) on delete set null,
  amount_chf   numeric(12, 2) not null check (amount_chf >= 0),
  status       public.offer_status not null default 'pending',
  created_at   timestamptz not null default now()
);
create index offers_item_idx on public.offers (item_id, created_at desc);

alter table public.offers enable row level security;

create policy "own item" on public.offers for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id))
  with check (
    exists (select 1 from public.items i where i.id = item_id)
    and (platform_id is null or exists (select 1 from public.platforms p where p.id = platform_id))
  );

revoke all on public.offers from anon;
grant select, insert, update, delete on public.offers to authenticated;
grant all on public.offers to service_role;
