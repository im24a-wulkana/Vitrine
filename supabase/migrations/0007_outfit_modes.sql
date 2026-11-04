-- VITRINE: outfits built on a canvas or from slots.

alter table public.outfits
  add column mode text not null default 'slots' check (mode in ('canvas', 'slots')),
  add column canvas_data jsonb not null default '{}',
  add column occasion text;

-- Placement on a 3:4 canvas, independent of screen size. x and y are the piece's
-- centre as a fraction of the canvas, scale is its width as a fraction of the
-- canvas width, and rotation is in degrees.
alter table public.outfit_items
  add column x double precision not null default 0.5,
  add column y double precision not null default 0.5,
  add column scale double precision not null default 0.5 check (scale > 0),
  add column rotation double precision not null default 0,
  add column z_index integer not null default 0;
