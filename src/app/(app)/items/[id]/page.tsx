import Link from "next/link";
import { notFound } from "next/navigation";
import { ItemActions } from "@/components/item-actions";
import { OfferLog } from "@/components/offer-log";
import { WearChart } from "@/components/wear-chart";
import { getCompRows } from "@/lib/sales-data";
import { daysBetween, imageFitClass, localDate, money, shortDate, signedMoney } from "@/lib/format";
import { costPerWear } from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import { MEASUREMENTS, STATUS_LABEL, type InventoryItem, type Listing, type Offer, type Platform, type PriceChange, isSampleItem } from "@/lib/types";

type DetailItem = InventoryItem & {
  listings: (Listing & { price_changes: PriceChange[] })[];
  wears: { worn_on: string }[];
  offers: Offer[];
  lots: { id: string; name: string } | null;
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireUser();
  const { data } = await db.from("items").select("brand, name").eq("id", id).maybeSingle();
  return { title: data ? `${data.brand} ${data.name}` : "Item" };
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireUser();
  const [{ data }, { data: platforms }, comps] = await Promise.all([
    db
      .from("items")
      .select("*, item_images(*), listings(*, price_changes(*)), sales(*), wears(worn_on), offers(*, platforms(name)), lots(id, name)")
      .eq("id", id)
      .maybeSingle(),
    db.from("platforms").select("*").order("name"),
    getCompRows(db),
  ]);
  if (!data) notFound();

  const item = data as DetailItem;
  const images = [...item.item_images].sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position);
  const listings = [...item.listings].sort((a, b) => b.listed_at.localeCompare(a.listed_at));
  const cpw = costPerWear(item.buy_price_chf, item.wears.length);
  const today = localDate();

  const facts: [string, string | null][] = [
    ["Size", item.size],
    ["Subcategory", item.subcategory],
    ["Storage", item.storage_location],
    ["Season", item.seasons.join(", ")],
    ["Occasion", item.occasions.join(", ")],
    ["Color", item.color],
    ["Category", item.category],
    ["Condition", item.condition ? `${item.condition}/10` : null],
    ["Bought", shortDate(item.buy_date)],
    ["From", item.buy_source],
    ["Paid", `${money(item.buy_price)} ${item.buy_currency}`],
    ["Cost in CHF", money(item.buy_price_chf)],
    ["Wears", String(item.wears.length)],
    ["Cost per wear", cpw === null ? null : money(cpw)],
  ];

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section aria-label="Photos" className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto md:mx-0 md:flex-col md:overflow-visible">
        {images.length === 0 && <div className="eyebrow grid aspect-[3/4] rounded-lg w-full shrink-0 place-items-center bg-muted">No photo</div>}
        {images.map((image) => (
          <img key={image.id} src={image.url} alt={`${item.brand} ${item.name}`} className={`aspect-[3/4] rounded-lg w-[88%] shrink-0 snap-center bg-muted md:w-full ${imageFitClass([{ ...image, is_primary: true }])}`} />
        ))}
      </section>

      <div className="flex flex-col gap-8">
        <header>
          <p className="eyebrow">{item.brand} · {STATUS_LABEL[item.status]}{isSampleItem(item) && " · Sample"}</p>
          <h1 className="page-title mt-2">{item.name}</h1>
          {item.tags.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5">{item.tags.map((t) => <span key={t} className="eyebrow border px-1.5 py-0.5">{t}</span>)}</p>}
        </header>

        {item.sales && (
          <section className="border-y py-4">
            <p className="eyebrow">Sold {shortDate(item.sales.sold_at)} on {item.sales.platform}</p>
            <p className="num mt-1 text-4xl">{signedMoney(Number(item.sales.net_profit))}</p>
            <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Sold for</dt><dd className="text-right">{money(item.sales.sale_price)}</dd>
              <dt className="text-muted-foreground">Fees</dt><dd className="text-right">−{money(item.sales.fees)}</dd>
              <dt className="text-muted-foreground">Shipping</dt><dd className="text-right">−{money(item.sales.shipping_cost)}</dd>
              <dt className="text-muted-foreground">Cost</dt><dd className="text-right">−{money(item.sales.item_cost_chf)}</dd>
            </dl>
          </section>
        )}

        <ItemActions item={item} listings={listings} platforms={(platforms ?? []) as Platform[]} comps={comps} />

        {item.lots && (
          <p className="text-sm text-muted-foreground">
            Part of lot <Link href={`/lots/${item.lots.id}`} className="text-foreground underline underline-offset-4">{item.lots.name}</Link>. Its cost is an equal share of the lot.
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {facts.filter(([, v]) => v && v !== "—").map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow">{label}</dt>
              <dd className="num mt-0.5">{value}</dd>
            </div>
          ))}
        </dl>
        {item.notes && <p className="text-sm whitespace-pre-wrap">{item.notes}</p>}

        {MEASUREMENTS.some(([key]) => item.measurements[key] !== undefined) && (
          <section>
            <h2 className="eyebrow border-b pb-2">Measurements, cm</h2>
            <dl className="mt-2 grid grid-cols-3 gap-3 text-sm">
              {MEASUREMENTS.filter(([key]) => item.measurements[key] !== undefined).map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="num">{item.measurements[key]}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <WearChart wears={item.wears} />

        <OfferLog itemId={item.id} offers={item.offers} platforms={(platforms ?? []) as Platform[]} canAdd={item.status !== "sold"} />

        {listings.length > 0 && (
          <section>
            <h2 className="eyebrow border-b pb-2">Listing history</h2>
            <ul className="text-sm">
              {listings.map((l) => (
                <li key={l.id} className="border-b py-2">
                  <div className="flex justify-between gap-2">
                    <span>{l.platform}</span>
                    <span className="num">{l.list_price === null ? "No price" : money(l.list_price)}</span>
                  </div>
                  <p className="num text-xs text-muted-foreground">
                    {shortDate(l.listed_at)} – {l.delisted_at ? shortDate(l.delisted_at) : `open, ${daysBetween(l.listed_at, today)} days`}
                  </p>
                  {l.price_changes
                    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
                    .map((c) => (
                      <p key={c.id} className="num text-xs text-muted-foreground">
                        {shortDate(c.changed_at)}: {money(c.old_price)} → {money(c.new_price)}
                      </p>
                    ))}
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href="/closet" className="self-start py-1.5 text-sm underline underline-offset-4">Back to closet</Link>
      </div>
    </div>
  );
}
