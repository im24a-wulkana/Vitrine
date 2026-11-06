"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYPAL_PAY_SPREAD, PAYPAL_RECEIVE_SPREAD, PAYPAL_REGIONS, paypalPay, paypalReceive, type PaypalRegion } from "@/lib/fees";
import { money } from "@/lib/format";
import { CURRENCIES } from "@/lib/types";

const DEFAULT_REGION: Record<string, PaypalRegion> = { CHF: "ch", EUR: "eea", GBP: "eea", USD: "other", JPY: "other" };

export function PaypalCalculator() {
  const [mode, setMode] = useState<"receive" | "pay">("receive");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [goods, setGoods] = useState(true);
  const [region, setRegion] = useState<PaypalRegion>("eea");
  const [spreads, setSpreads] = useState({ receive: String(PAYPAL_RECEIVE_SPREAD), pay: String(PAYPAL_PAY_SPREAD) });
  const [market, setMarket] = useState<{ currency: string; rate: number | null } | null>(null);
  const [typedRate, setTypedRate] = useState<{ currency: string; value: string } | null>(null);

  // The market rate is fetched per currency. A rate typed in for that currency replaces it.
  useEffect(() => {
    if (currency === "CHF") return;
    let cancelled = false;
    fetch(`/api/fx?from=${currency}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((body) => {
        if (!cancelled) setMarket({ currency, rate: body.rate });
      })
      .catch(() => {
        if (!cancelled) setMarket({ currency, rate: null });
      });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const fetched = currency === "CHF" ? 1 : market?.currency === currency ? market.rate : null;
  const loading = currency !== "CHF" && market?.currency !== currency;
  const typed = typedRate?.currency === currency ? typedRate.value : null;
  const rate = Number(typed ?? fetched) || 0;

  const value = Number(amount) || 0;
  const spreadPercent = Number(spreads[mode]) || 0;
  const receipt = paypalReceive({ amount: value, currency, rate, spreadPercent, goods, region });
  const payment = paypalPay({ amount: value, currency, rate, spreadPercent });
  const receiving = mode === "receive";

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
        <p className="eyebrow">{receiving ? "You end up with, CHF" : "You're charged, CHF"}</p>
        <p className="num mt-1 text-6xl leading-none tracking-tight">{money(receiving ? receipt.netChf : payment.chargedChf)}</p>
        {value > 0 && rate > 0 && (
          <dl className="num mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">At the market rate</dt>
            <dd className="text-right">{money(receiving ? receipt.marketChf : payment.marketChf)}</dd>
            {receiving ? (
              <>
                {goods && (
                  <>
                    <dt className="text-muted-foreground">PayPal sale fee</dt>
                    <dd className="text-right">{money(receipt.feeChf)}</dd>
                  </>
                )}
                {currency !== "CHF" && (
                  <>
                    <dt className="text-muted-foreground">Exchange rate cost</dt>
                    <dd className="text-right">{money(receipt.conversionCostChf)}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Lost in total</dt>
                <dd className="text-right">{receipt.lostPercent.toFixed(2)}%</dd>
              </>
            ) : (
              <>
                <dt className="text-muted-foreground">Exchange rate cost</dt>
                <dd className="text-right">{money(payment.extraChf)}</dd>
              </>
            )}
          </dl>
        )}
      </section>

      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="pp-amount">{receiving ? "Amount the buyer pays" : "Price"}</Label>
            <Input id="pp-amount" inputMode="decimal" className="num" value={amount} onChange={(e) => setAmount(e.target.value.replace(",", "."))} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="pp-currency">Currency</Label>
            <select
              id="pp-currency"
              className="field"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
                setRegion(DEFAULT_REGION[e.target.value] ?? "other");
              }}
            >
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {currency !== "CHF" && (
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pp-rate">Market rate, CHF per {currency}</Label>
              <Input
                id="pp-rate"
                inputMode="decimal"
                className="num"
                placeholder={loading ? "Loading…" : "Enter a rate"}
                value={typed ?? (fetched !== null ? String(fetched) : "")}
                onChange={(e) => setTypedRate({ currency, value: e.target.value.replace(",", ".") })}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="pp-spread">PayPal&apos;s markup, %</Label>
              <Input id="pp-spread" inputMode="decimal" className="num" value={spreads[mode]} onChange={(e) => setSpreads({ ...spreads, [mode]: e.target.value.replace(",", ".") })} />
            </div>
          </div>
        )}
        {!loading && fetched === null && typed === null && <p role="status" className="text-xs text-muted-foreground">Couldn&apos;t get today&apos;s rate. Enter one to calculate.</p>}

        {receiving && (
          <fieldset className="flex flex-col gap-3 border-t pt-4">
            <legend className="eyebrow mb-2">PayPal sale fee</legend>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-current" checked={goods} onChange={(e) => setGoods(e.target.checked)} />
              It&apos;s a sale of goods
            </label>
            {goods && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="pp-region">Buyer&apos;s PayPal account</Label>
                <select id="pp-region" className="field" value={region} onChange={(e) => setRegion(e.target.value as PaypalRegion)}>
                  {PAYPAL_REGIONS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}, {(3.4 + r.percent).toFixed(2)}%</option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>
        )}
      </form>

      <section className="text-xs text-muted-foreground">
        <h2 className="eyebrow mb-2">How this works</h2>
        <p>
          Market rates are European Central Bank reference rates. PayPal&apos;s markup is {PAYPAL_RECEIVE_SPREAD}% when it converts money you received and {PAYPAL_PAY_SPREAD}% when you pay in another currency.
          A foreign balance only converts when you move it to CHF, so you can avoid the markup by spending it in the same currency or withdrawing to a bank account in that currency, if yours supports one.
        </p>
        <p className="mt-2">
          Rates are from{" "}
          <a href="https://www.paypalobjects.com/marketing/ua/pdf/CH/en/merchant-fee-111021.pdf" target="_blank" rel="noreferrer" className="underline underline-offset-4">PayPal&apos;s Swiss merchant fee schedule</a>
          , dated November 2021. PayPal&apos;s current page couldn&apos;t be read automatically, so compare them with your own account. You can change the markup above.
        </p>
      </section>
    </div>
  );
}
