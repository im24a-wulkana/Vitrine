"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYPAL_PAY_SPREAD, PAYPAL_RECEIVE_SPREAD, PAYPAL_REGIONS, paypalPay, paypalReceive, swissPaypalFee, type PaypalRegion } from "@/lib/fees";
import { money } from "@/lib/format";
import { CURRENCIES } from "@/lib/types";

const DEFAULT_REGION: Record<string, PaypalRegion> = { CHF: "ch", EUR: "eea", GBP: "eea", USD: "other", JPY: "other" };

// Each person's own currency and PayPal fee, on this device. Fees depend on the
// country of their PayPal account, so they're entered once and remembered.
const STORE_KEY = "vitrine.paypal";
type Saved = { home?: string; fees?: Record<string, { percent: string; fixed: Record<string, string>; abroad: string }> };
const listeners = new Set<() => void>();
function readSaved(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function writeSaved(change: (saved: Saved) => Saved) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(change(JSON.parse(readSaved()) as Saved)));
  } catch {
    // Private browsing: the values just aren't remembered.
  }
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const options = (current: string) => [...new Set([...CURRENCIES, current])];

export function PaypalCalculator({ defaultHome }: { defaultHome: string }) {
  const saved = JSON.parse(useSyncExternalStore(subscribe, readSaved, () => "{}")) as Saved;
  const home = saved.home ?? defaultHome;

  const [mode, setMode] = useState<"receive" | "pay">("receive");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked ?? (home === "EUR" ? "USD" : "EUR");
  const [goods, setGoods] = useState(true);
  const [region, setRegion] = useState<PaypalRegion | null>(null);
  const swissRegion = region ?? DEFAULT_REGION[currency] ?? "other";
  const [spreads, setSpreads] = useState({ receive: String(PAYPAL_RECEIVE_SPREAD), pay: String(PAYPAL_PAY_SPREAD) });
  const [market, setMarket] = useState<{ pair: string; rate: number | null } | null>(null);
  const [typedRate, setTypedRate] = useState<{ pair: string; value: string } | null>(null);
  const pair = `${currency}-${home}`;

  // The market rate is fetched per pair. A rate typed in for that pair replaces it.
  useEffect(() => {
    if (currency === home) return;
    let cancelled = false;
    fetch(`/api/fx?from=${currency}&to=${home}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        if (!cancelled) setMarket({ pair, rate: body.rate });
      })
      .catch(() => {
        if (!cancelled) setMarket({ pair, rate: null });
      });
    return () => {
      cancelled = true;
    };
  }, [currency, home, pair]);

  const fetched = currency === home ? 1 : market?.pair === pair ? market.rate : null;
  const loading = currency !== home && market?.pair !== pair;
  const typed = typedRate?.pair === pair ? typedRate.value : null;
  const rate = Number(typed ?? fetched) || 0;

  // Swiss accounts use PayPal Switzerland's published rates. Anyone else enters theirs.
  const swiss = home === "CHF";
  const ownFees = saved.fees?.[home];
  const ownFixed = ownFees?.fixed?.[currency] ?? "";
  const fee = swiss
    ? swissPaypalFee(currency, swissRegion)
    : { percent: (Number(ownFees?.percent) || 0) + (currency === home ? 0 : Number(ownFees?.abroad) || 0), fixed: Number(ownFixed) || 0 };
  const feeMissing = goods && !swiss && !ownFees?.percent;
  const setOwnFee = (change: Partial<{ percent: string; abroad: string; fixed: string }>) =>
    writeSaved((s) => {
      const current = s.fees?.[home] ?? { percent: "", fixed: {}, abroad: "" };
      const next = {
        percent: change.percent ?? current.percent,
        abroad: change.abroad ?? current.abroad,
        fixed: change.fixed === undefined ? current.fixed : { ...current.fixed, [currency]: change.fixed },
      };
      return { ...s, fees: { ...s.fees, [home]: next } };
    });

  const value = Number(amount) || 0;
  const spreadPercent = Number(spreads[mode]) || 0;
  const receipt = paypalReceive({ amount: value, currency, home, rate, spreadPercent, feePercent: goods ? fee.percent : 0, fixedFee: goods ? fee.fixed : 0 });
  const payment = paypalPay({ amount: value, currency, home, rate, spreadPercent });
  const receiving = mode === "receive";
  const decimal = (v: string) => v.replace(",", ".");

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-8">
      <div>
        <h1 className="page-title">PayPal currency</h1>
        <p className="mt-2 text-sm text-muted-foreground">What PayPal&apos;s exchange rate really costs compared with the market rate.</p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
        <button type="button" className="chip justify-center" data-active={receiving} aria-pressed={receiving} onClick={() => setMode("receive")}>You get paid</button>
        <button type="button" className="chip justify-center" data-active={!receiving} aria-pressed={!receiving} onClick={() => setMode("pay")}>You pay</button>
      </div>

      <section aria-live="polite">
        <p className="eyebrow">{receiving ? `You end up with, ${home}` : `You're charged, ${home}`}</p>
        <p className="num mt-1 text-6xl leading-none tracking-tight">{money(receiving ? receipt.netHome : payment.chargedHome)}</p>
        {value > 0 && rate > 0 && (
          <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">At the market rate</dt>
            <dd className="text-right">{money(receiving ? receipt.marketHome : payment.marketHome)}</dd>
            {receiving ? (
              <>
                {goods && (
                  <>
                    <dt className="text-muted-foreground">PayPal sale fee</dt>
                    <dd className="text-right">{feeMissing ? "Not set" : money(receipt.feeHome)}</dd>
                  </>
                )}
                {currency !== home && (
                  <>
                    <dt className="text-muted-foreground">Exchange rate cost</dt>
                    <dd className="text-right">{money(receipt.conversionCostHome)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Lost in total</dt>
                <dd className="text-right">{receipt.lostPercent.toFixed(2)}%</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Exchange rate cost</dt>
                <dd className="text-right">{money(payment.extraHome)}</dd>
              </>
            )}
          </dl>
        )}
        {receiving && feeMissing && value > 0 && <p role="status" className="mt-2 text-xs text-muted-foreground">Add your PayPal sale fee below to include it.</p>}
      </section>

      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="pp-amount">{receiving ? "Amount the buyer pays" : "Price"}</Label>
            <Input id="pp-amount" inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(decimal(e.target.value))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="pp-currency">In</Label>
            <select id="pp-currency" className="field" value={currency} onChange={(e) => { setPicked(e.target.value); setRegion(null); }}>
              {options(currency).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="pp-home">Your currency</Label>
          <select id="pp-home" className="field" value={home} onChange={(e) => writeSaved((s) => ({ ...s, home: e.target.value }))}>
            {options(home).map((c) => <option key={c}>{c}</option>)}
          </select>
          <p className="text-xs text-muted-foreground">What your PayPal balance converts to. Remembered on this device.</p>
        </div>

        {currency !== home && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pp-rate">Market rate, {home} per {currency}</Label>
              <Input
                id="pp-rate"
                inputMode="decimal"
                className="num"
                placeholder={loading ? "Loading…" : "Enter a rate"}
                value={typed ?? (fetched !== null ? String(fetched) : "")}
                onChange={(e) => setTypedRate({ pair, value: decimal(e.target.value) })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pp-spread">PayPal&apos;s markup, %</Label>
              <Input id="pp-spread" inputMode="decimal" className="num" value={spreads[mode]} onChange={(e) => setSpreads({ ...spreads, [mode]: decimal(e.target.value) })} />
            </div>
          </div>
        )}
        {currency !== home && !loading && fetched === null && typed === null && <p role="status" className="text-xs text-muted-foreground">Couldn&apos;t get today&apos;s rate. Enter one to calculate.</p>}

        {receiving && (
          <fieldset className="flex flex-col gap-3 border-t pt-4">
            <legend className="eyebrow mb-2">PayPal sale fee</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-current" checked={goods} onChange={(e) => setGoods(e.target.checked)} />
              It&apos;s a sale of goods
            </label>
            {goods && swiss && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="pp-region">Buyer&apos;s PayPal account</Label>
                <select id="pp-region" className="field" value={swissRegion} onChange={(e) => setRegion(e.target.value as PaypalRegion)}>
                  {PAYPAL_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}, {swissPaypalFee(currency, r.id).percent.toFixed(2)}%</option>
                  ))}
                </select>
              </div>
            )}
            {goods && !swiss && (
              <>
                <p className="text-xs text-muted-foreground">
                  PayPal&apos;s fee depends on the country of your account. Copy it from PayPal&apos;s fee page for your country. Foreign is the extra PayPal adds when you&apos;re paid in another currency. It&apos;s remembered on this device.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="pp-fee">Fee, %</Label>
                    <Input id="pp-fee" inputMode="decimal" className="num" placeholder="e.g. 2.99" value={ownFees?.percent ?? ""} onChange={(e) => setOwnFee({ percent: decimal(e.target.value) })} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="pp-fixed">Fixed, {currency}</Label>
                    <Input id="pp-fixed" inputMode="decimal" className="num" placeholder="0.00" value={ownFixed} onChange={(e) => setOwnFee({ fixed: decimal(e.target.value) })} />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="pp-abroad">Foreign, +%</Label>
                    <Input id="pp-abroad" inputMode="decimal" className="num" placeholder="0" value={ownFees?.abroad ?? ""} onChange={(e) => setOwnFee({ abroad: decimal(e.target.value) })} />
                  </div>
                </div>
              </>
            )}
          </fieldset>
        )}
      </form>

      <section className="text-xs text-muted-foreground">
        <h2 className="eyebrow mb-2">How this works</h2>
        <p>
          Market rates are European Central Bank reference rates. PayPal&apos;s markup is usually about {PAYPAL_RECEIVE_SPREAD}% when it converts money you received and {PAYPAL_PAY_SPREAD}% when you pay in another currency, but it varies by country, so you can change it above.
          A foreign balance only converts when you move it to your own currency, so you can avoid the markup by spending it in the same currency or withdrawing to a bank account in that currency, if yours supports one.
        </p>
        <p className="mt-2">
          The Swiss rates are from{" "}
          <a href="https://www.paypalobjects.com/marketing/ua/pdf/CH/en/merchant-fee-111021.pdf" target="_blank" rel="noreferrer" className="underline underline-offset-4">PayPal&apos;s Swiss merchant fee schedule</a>
          , dated November 2021. PayPal&apos;s current page couldn&apos;t be read automatically, so compare them with your own account.
        </p>
      </section>
    </div>
  );
}
