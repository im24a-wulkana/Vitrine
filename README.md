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

Open http://localhost:3000 and sign in with your seed account.

## Before you use it for real

- **Set your fees.** New accounts get a few platforms at 0% in **Settings**. Enter your actual rates, because the sold dialog uses them for its fee preset.
- **Close signups.** The app has no sign-up form. Create accounts under Authentication in Supabase, then turn off "Allow new users to sign up" there, because the sign-up API stays open until you do.

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Only add the service role key if you use scheduled notifications, and never with a `NEXT_PUBLIC_` prefix.
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
- **Max buy** is `(sale price - fees - shipping) / (1 + target ROI)`, rounded down.
- **Sell-through** is sold items divided by sold items plus unsold stock, all time. Personal items aren't counted.
- **Lots** split their total cost evenly across their items, with leftover cents going to the oldest items. An item's cost is set by its lot, and changing the total also updates the profit of items already sold.
- **Unworn items** are Personal items with no wear in 6 months, counted from the purchase date if never worn.

## Outfits

Build an outfit in either of two ways, and switch between them at any time:

- **Slots:** swipe through one row per slot (outerwear, tops, bottoms, shoes, accessories). Each row holds one piece or none.
- **Canvas:** drag, resize, rotate and layer pieces on a 3:4 canvas. It uses cutouts where they exist. Placements are stored as fractions of the canvas, so an outfit looks the same on any screen.

`react-konva` is pinned to 19.0.10 because newer versions need React 19.2 or later. It can move up when React does.

## Calendar

Each day has one log: an outfit, its pieces, an optional mirror photo, and the weather if it was logged that day. Logging a wear anywhere in the app writes to that day's log, and a database trigger keeps the `wears` table that cost per wear reads in step.

Weather comes from [Open-Meteo](https://open-meteo.com), which needs no key. Your saved coordinates or city name are sent to it from the server, and nothing else.

## AI

Add `ANTHROPIC_API_KEY` to `.env.local` to turn on two features. Everything else works without it. AI calls only run on the server, and the key never reaches the browser.

- **Tagging:** adding a photo sends a small copy to Claude (`claude-haiku-5-5`), which suggests a category, colours and more. Nothing is applied until you confirm, and it returns blank rather than guessing. It never suggests a brand; text it can read on a label is shown, and you choose whether to use it.
- **Generate outfit:** sends your personal items' tags, the weather, and your chosen occasion and anchor piece. It returns item ids and a short reason, and the ids are checked against your items before use.

Without a key, colours still come from the photo itself, using `node-vibrant` on the device. To add another provider, implement `VisionProvider` and `LLMProvider` in `src/lib/ai/providers.ts`.

## Notifications

Web Push covers aging listings (at most weekly), sales waiting to ship (at most daily) and reaching your monthly profit goal (once a month).

1. Generate keys with `npx web-push generate-vapid-keys`, and add them to `.env.local` with `VAPID_SUBJECT`.
2. Run a production build (`npm run build`, then `npm run start`). Service workers are off under `npm run dev`.
3. Turn notifications on in **Settings**, on each device. On an iPhone, add Vitrine to your Home Screen first.

In local mode, **Check now** in Settings sends what's due. On Vercel, `vercel.json` runs the check daily. That needs `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` set in Vercel, because the job reads every account's data on the server. It's the only place the app uses that key.

## Backup

**Import and export** has a full JSON backup of your account. Photos are included as links, not files, so keep those separately. There's no restore screen yet.

## Rules the database enforces

- An item is `sold` only if it has a sale. Record a sale to sell it, and delete the sale to undo that.
- An item is `listed` only if it has an open listing. Setting the status opens or closes listings, and closing the last listing moves the item back to stock.
- List price changes write to `price_changes` automatically.
- An item can be logged as worn once per day.

## Photos

Photos are compressed in the browser, then uploaded. The background is removed on your device, using [`@imgly/background-removal`](https://github.com/imgly/background-removal-js), so photos aren't sent anywhere for this. Each photo keeps both versions, and you can switch between them.

- The first cutout downloads a 44 MB AI model from the library's CDN. The browser then caches it.
- The library is licensed under **AGPL-3.0**. That's fine for personal use, but check its terms before distributing Vitrine or offering it to others as a hosted service.

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
