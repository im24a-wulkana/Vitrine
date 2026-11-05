-- VITRINE: every photo can keep its original and a background-removed cutout.
-- item_images.url stays the version on display, and always equals one of these two.

alter table public.item_images
  add column original_url text,
  add column cutout_url text;

update public.item_images set original_url = url where original_url is null;
