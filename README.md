# Vitrine

A personal wardrobe and resale profit tracker. It's an installable, mobile-first PWA built with Next.js 15, Supabase, Tailwind, shadcn/ui and Recharts.

## Quick start (no database needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys configured, Vitrine runs in **local mode**:

- There's no sign-in, and sample data loads on first run. Settings has **Start empty** and **Reload sample data**.
- Data and photos are saved in the `.vitrine-data` folder, using an embedded Postgres with the same migrations and rules as Supabase. Delete the folder to start over.
- The server only listens on this computer, because local mode has no login.

## Moving to Supabase later

You need a [Supabase](https://supabase.com) project. Adding its keys switches the whole app over with no code changes. Local data doesn't move automatically, so use **Import and export** to export your items first and import them afterwards.

### 1. Install

```bash
npm install
```

### 2. Add your keys

```bash
cp .env.example .env.local
```

Fill in `.env.local` using the values from your Supabase project's API settings. `SUPABASE_SERVICE_ROLE_KEY` and the `SEED_USER_*` values are only used by the seed script.

### 3. Run the migrations

Using the Supabase CLI:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push
```

Or paste the files from `supabase/migrations/` into the SQL editor, in filename order.

### 4. Load sample data (optional)

Skip this if you're bringing your own data.

```bash
npm run seed
```

This creates the account named in `SEED_USER_EMAIL` with 15 made-up items across every status, plus sales, listings, wears, an outfit, expenses and a wishlist. Fee presets in the seed are examples only.

If the account already has items, the script stops without changing anything. `npm run seed -- --reset` deletes that account's data and seeds it again.

### 5. Start the app

```bash
npm run dev
```

Open http://localhost:3000 and sign in with your seed account, or sign up.

## Before you use it for real

- **Set your fees.** New accounts get a few platforms at 0% in **Settings**. Enter your actual rates, because the sold dialog uses them for its fee preset.
- **Close signups.** Once your account exists, turn off "Allow new users to sign up" under Authentication in Supabase. Row level security keeps each account's data separate, but this is a personal app.

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not add the service role key.
3. In Supabase, under Authentication > URL Configuration, set the Site URL to your Vercel domain and add `https://your-domain/auth/callback` as a redirect URL.

To install it on a phone, open the deployed site and choose **Add to Home Screen**.

## How the numbers work

- **All profit is in CHF.** Sale prices, fees, shipping and expenses are treated as CHF. Purchases can be in another currency: the form prefills the CHF value from the ECB rate on the purchase date ([Frankfurter](https://frankfurter.dev)), and you can overwrite it. If the lookup fails, you type the value in.
- **Net profit** is `sale_price - fees - shipping_cost - cost`. Postgres can't read another table from a generated column, so `sales.item_cost_chf` holds a copy of `items.buy_price_chf`, kept in sync by triggers. Correcting an item's cost updates its past sale.
- **Dashboard net profit** subtracts expenses dated in the selected period.
- **Average ROI** is the mean of `net_profit / cost` per sold item. Items with zero cost are left out.
- **Days to sell** runs from the first listing to the sale, or from the purchase date if the item was never listed.
- **Inventory value** is the cost of items that are In stock or Listed. Personal items aren't counted.
- **Aging alerts** count from the listing date or the latest price change, whichever is newer, so a markdown restarts the clock.
- **Unworn items** are Personal items with no wear in 6 months, counted from the purchase date if never worn.

## Rules the database enforces

- An item is `sold` only if it has a sale. Record a sale to sell it, and delete the sale to undo that.
- An item is `listed` only if it has an open listing. Setting the status opens or closes listings, and closing the last listing moves the item back to stock.
- List price changes write to `price_changes` automatically.
- An item can be logged as worn once per day.

## Privacy

Every table uses row level security, and anonymous users have no table access. Photos are in a public-read Storage bucket: each file has an unguessable URL and can't be listed, and only its owner can change or delete it, but anyone who has a photo's URL can open it.

## Tests

```bash
npm test
```

This runs the real migrations in PGlite (Postgres compiled to WASM, no Docker needed) to test triggers and row level security, and also tests the profit, aging and CSV logic.

## Project layout

```
supabase/migrations/  Schema, RLS and storage
scripts/seed.ts       Sample data
src/app/(app)/        Signed-in pages
src/app/export/       CSV downloads
src/lib/actions/      Server actions
src/lib/local/        Local mode: embedded database and client
src/lib/metrics.ts    Profit, ROI, aging and wardrobe calculations
src/lib/csv.ts        CSV parsing, column mapping, row validation
tests/                Database and logic tests
```
