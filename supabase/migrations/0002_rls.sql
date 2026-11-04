-- VITRINE: row level security. Every row belongs to the signed-in user, either
-- directly through user_id or through its parent item, listing or outfit.

alter table public.items         enable row level security;
alter table public.item_images   enable row level security;
alter table public.listings      enable row level security;
alter table public.price_changes enable row level security;
alter table public.sales         enable row level security;
alter table public.platforms     enable row level security;
alter table public.expenses      enable row level security;
alter table public.wears         enable row level security;
alter table public.outfits       enable row level security;
alter table public.outfit_items  enable row level security;
alter table public.wishlist      enable row level security;
alter table public.user_settings enable row level security;

-- Direct ownership.
create policy "own rows" on public.items for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.platforms for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.expenses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.outfits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.wishlist for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own rows" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ownership through the parent item. The subquery is itself filtered by the
-- items policy, so it only sees the caller's items.
create policy "own item" on public.item_images for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id))
  with check (exists (select 1 from public.items i where i.id = item_id));
create policy "own item" on public.listings for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id))
  with check (exists (select 1 from public.items i where i.id = item_id));
create policy "own item" on public.sales for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id))
  with check (exists (select 1 from public.items i where i.id = item_id));
create policy "own item" on public.wears for all to authenticated
  using (exists (select 1 from public.items i where i.id = item_id))
  with check (exists (select 1 from public.items i where i.id = item_id));

create policy "own listing" on public.price_changes for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id))
  with check (exists (select 1 from public.listings l where l.id = listing_id));

-- An outfit may only contain the caller's own items.
create policy "own outfit" on public.outfit_items for all to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id))
  with check (
    exists (select 1 from public.outfits o where o.id = outfit_id)
    and exists (select 1 from public.items i where i.id = item_id)
  );

-- Explicit grants, so access does not depend on project-level defaults.
-- anon gets nothing: every screen requires a session.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
