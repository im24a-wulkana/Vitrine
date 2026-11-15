-- Trades: an item swapped for another one rather than sold for money.
--
-- A trade is a sales row with kind = 'trade', so everything that hangs off a sale
-- (the item becoming 'sold', listings closing, shipping) works the same way. Its
-- sale_price is the item's own cost, so it shows no profit, and the sales figures
-- leave trades out. traded_for points at the item received, which carries the
-- traded item's cost forward, so profit is counted once, when that one is sold.

alter table public.sales
  add column kind text not null default 'sale' check (kind in ('sale', 'trade')),
  add column traded_for uuid references public.items (id) on delete set null;

create index sales_traded_for_idx on public.sales (traded_for) where traded_for is not null;

-- Both sides of a trade must belong to the same person. Row level security already
-- limits the sold item to its owner; this covers the item received.
create or replace function public.sales_check_trade() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.traded_for is not null and (
    select user_id from public.items where id = new.traded_for
  ) is distinct from (
    select user_id from public.items where id = new.item_id
  ) then
    raise exception 'The traded item must be your own';
  end if;
  return new;
end $$;

create trigger sales_check_trade before insert or update of traded_for, item_id on public.sales
  for each row execute function public.sales_check_trade();
