-- What an item was before it was traded, so undoing the trade puts it back as it was.
-- Undoing a sale otherwise always returns the item to stock.
alter table public.sales
  add column previous_status text check (previous_status in ('personal', 'in_stock', 'listed'));
