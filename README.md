# Vitrine

A personal wardrobe and resale profit tracker. It's an installable, mobile-first PWA built with Next.js 16, Neon, Tailwind, shadcn/ui and Recharts.

## Quick start (no database needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no database configured, Vitrine runs in **local mode**:

- There's no sign-in, and sample data loads on first run. Settings has **Start empty** and **Reload sample data**.
- Data and photos are saved in the `.vitrine-data` folder, using an embedded Postgres with the same migrations and rules as Neon. Delete the folder to start over.
- The server only listens on this computer, because local mode has no login.

## Moving to Neon

You need a [Neon](https://neon.com) project on AWS, because Neon Auth is AWS only. Local data doesn't move automatically, so use **Import and export** first and import it afterwards.

### 1. Add your settings

In your Neon project, turn on **Auth**. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`. Don't enable Neon's Data API, which installs its own `auth` schema.

### 2. Set up the database

```bash
npm run db:migrate
```

Safe to run again. It only applies what's new.

### 3. Sign in

There's nothing to set up per person. The first Google sign-in creates that person's account. To load sample data into one, sign in once, set `SEED_USER_EMAIL`, then run `npm run seed`.

### 4. Start the app

```bash
npm run dev
```

## Before you use it for real

- **Check your fees.** Platforms at 0% in **Settings** use the published fees in `src/lib/fees.ts`, checked November 2026. Enter a rate there if yours differs, for example for a Ricardo category other than fashion. The sold dialog and calculators use the same numbers.
- **Keep the database URL private.** It connects as the database owner.

## Trades

**Traded** on an item's page records a swap. What you got becomes a new item that carries what yours cost, plus or minus any cash on top, and yours closes as traded. Trades aren't counted as sales, so profit shows once, when you sell what you got. Undoing a trade removes what you got, unless it has been sold or traded on since.

## Demo

The login page links to a demo that anyone can open without signing in. It's a shared account filled with sample data, opened read-only: the database itself refuses any change, and photo uploads and AI tagging are off. Refresh its data with `npm run demo:seed`.

## Who can get in

Anyone with a Google account. Their first sign-in creates a private account, with its own settings, items and photos. Google is the only sign-in method: email and password are turned off in Neon Auth, and the app's auth route only passes on Google sign-in and sign-out.

Sign-in uses Neon's shared Google app, so Google's consent screen shows Neon's name rather than Vitrine's. To show your own, create a Google OAuth client with the redirect URI `{NEON_AUTH_BASE_URL}/callback/google` and add it under Auth in Neon.

Open sign-up has running costs: every signed-in person can use AI tagging on your Anthropic key, and adds to your Neon and Vercel Blob storage.

## How accounts stay separate

Neon's owner role bypasses row level security, so every query from a signed-in person runs in a transaction that switches to the restricted `authenticated` role and sets their user id. The rules in `db/migrations` then apply. See `src/lib/db/neon.ts`. Only three things use the owner connection directly: creating an account on first sign-in, the scheduled notification job, and the setup scripts.

## Deploy to Vercel

1. Push the repository to GitHub and import it in Vercel.
2. Add `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, and your other settings from `.env.local`.
3. In the project's **Storage** tab, create a **Blob** store with **private** access. You can't change the access mode later.
4. In Neon, under Auth > Configuration > Domains, add your Vercel address, and turn off **Allow Localhost** in production.

To install it on an iPhone, open the site in Safari, tap **Share**, then **Add to Home Screen**. Launch screens for current iPhones are in `public/icons/splash`.

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

In local mode, **Check now** in Settings sends what's due. On Vercel, `vercel.json` runs the check daily. That needs `CRON_SECRET` set in Vercel.

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

Every table uses row level security, and signed-out visitors have no table access. Photos are private: each is served through `/api/photos`, only to the account that owns it.

## Tests

```bash
npm test
```

This runs the real migrations in PGlite (Postgres compiled to WASM, no Docker needed) to test triggers and row level security, and also tests the profit, aging and CSV logic.

## Project layout

```
db/migrations/        Schema and row level security
scripts/seed.ts       Sample data
src/app/(app)/        Signed-in pages
src/app/export/       CSV downloads
src/lib/actions/      Server actions
src/lib/db/           Query client, Neon connection, migrations
src/lib/local/        Local mode: embedded database
src/lib/session.ts    Who is signed in, and the access check
src/lib/storage.ts    Private photo storage
src/lib/metrics.ts    Profit, ROI, aging and wardrobe calculations
src/lib/csv.ts        CSV parsing, column mapping, row validation
tests/                Database and logic tests
```
