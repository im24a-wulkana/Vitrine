import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateFees, paypalPay, paypalReceive, swissPaypalFee } from "../src/lib/fees";
import { feeFor, wardrobeValue } from "../src/lib/metrics";

const published = (name: string, price: number) => estimateFees({ name, fee_percent: 0, fee_fixed: 0 }, price);

test("Vinted and Tutti take nothing from the seller", () => {
  assert.deepEqual(published("Vinted", 100), { lines: [], total: 0, net: 100, basis: "published" });
  assert.equal(published("Tutti", 100).total, 0);
});

test("Ricardo charges 12% with a minimum and a cap", () => {
  assert.equal(published("Ricardo", 100).total, 12);
  assert.equal(published("Ricardo", 0.5).total, 0.1);
  assert.equal(published("Ricardo", 5000).total, 290);
});

test("Vestiaire follows its CHF tiers from October 2026", () => {
  assert.equal(published("Vestiaire Collective", 50).total, 15);
  assert.equal(published("Vestiaire Collective", 74.99).total, 15);
  assert.equal(published("Vestiaire Collective", 75).total, 15.75, "the 17% tier starts at 75");
  assert.equal(published("Vestiaire Collective", 100).total, 20);
  assert.equal(published("Vestiaire Collective", 20000).total, 3100);
});

test("Grailed changes tier at $120, with a minimum commission", () => {
  const under = published("Grailed", 50);
  assert.equal(under.lines[0].label, "Commission, 6%");
  assert.equal(under.lines[0].amount, 3);
  assert.equal(published("Grailed", 10).lines[0].amount, 1.63, "$1.99 minimum");
  const over = published("Grailed", 200);
  assert.equal(over.lines[0].label, "Commission, 9%");
  assert.equal(over.lines[0].amount, 18);
  assert.equal(over.lines[1].amount, 10.38);
  assert.equal(over.total, 28.38);
});

test("Depop is 10% plus PayPal", () => {
  assert.equal(published("Depop", 100).total, 13.95);
});

test("names match whatever the case, and unknown platforms have no published fee", () => {
  assert.equal(published("  ricardo ", 100).total, 12);
  assert.deepEqual(published("Instagram / private", 100), { lines: [], total: 0, net: 100, basis: "none" });
});

test("a rate in Settings replaces the published fees", () => {
  const mine = estimateFees({ name: "Ricardo", fee_percent: 5, fee_fixed: 1 }, 100);
  assert.equal(mine.basis, "settings");
  assert.equal(mine.total, 6);
  assert.equal(mine.net, 94);
});

test("no sale means no fee", () => {
  assert.equal(published("Ricardo", 0).total, 0);
  assert.equal(published("Ricardo", -5).total, 0);
  assert.equal(estimateFees(undefined, 100).total, 0);
});

test("the sold dialog and max-buy preset use the same fees", () => {
  assert.equal(feeFor({ name: "Ricardo", fee_percent: 0, fee_fixed: 0 }, 100), 12);
  assert.equal(feeFor({ name: "Ricardo", fee_percent: 9, fee_fixed: 0.7 }, 100), 9.7);
  assert.equal(feeFor({ fee_percent: 9, fee_fixed: 0 }, 100), 9);
});

const swissEea = swissPaypalFee("EUR", "eea");

test("PayPal: EUR sale from the EEA to a Swiss account, converted to CHF", () => {
  assert.deepEqual(swissEea, { percent: 4.69, fixed: 0.35 });
  const r = paypalReceive({ amount: 100, currency: "EUR", home: "CHF", rate: 0.92, spreadPercent: 3, feePercent: swissEea.percent, fixedFee: swissEea.fixed });
  // Fee 4.69% + 0.35 EUR = 5.04 EUR. 94.96 EUR x 0.92 = 87.36 CHF, less 3%.
  assert.equal(r.fee, 5.04);
  assert.equal(r.feeHome, 4.64);
  assert.equal(r.marketHome, 92);
  assert.equal(r.conversionCostHome, 2.62);
  assert.equal(r.netHome, 84.74);
  assert.equal(r.lostPercent, 7.89);
});

test("PayPal: works from any home currency, not just CHF", () => {
  // A euro account paid in dollars, with that person's own fee entered.
  const r = paypalReceive({ amount: 100, currency: "USD", home: "EUR", rate: 0.8957, spreadPercent: 3, feePercent: 2.99, fixedFee: 0.49 });
  assert.equal(r.fee, 3.48);
  assert.equal(r.marketHome, 89.57);
  assert.equal(r.netHome, 83.86);
  // Paid in your own currency: no conversion, only the fee.
  const same = paypalReceive({ amount: 100, currency: "EUR", home: "EUR", rate: 1, spreadPercent: 3, feePercent: 2.99, fixedFee: 0.35 });
  assert.equal(same.conversionCostHome, 0);
  assert.equal(same.netHome, 96.66);
  assert.deepEqual(paypalPay({ amount: 100, currency: "GBP", home: "USD", rate: 1.34, spreadPercent: 4 }), { marketHome: 134, chargedHome: 139.36, extraHome: 5.36 });
  assert.equal(paypalPay({ amount: 100, currency: "USD", home: "USD", rate: 1, spreadPercent: 4 }).extraHome, 0);
});

test("PayPal: friends payment has no sale fee, and CHF to a Swiss account has no conversion", () => {
  const friends = paypalReceive({ amount: 100, currency: "USD", home: "CHF", rate: 0.82, spreadPercent: 3, feePercent: 0, fixedFee: 0 });
  assert.equal(friends.fee, 0);
  assert.equal(friends.netHome, 79.54);
  const local = swissPaypalFee("CHF", "ch");
  const chf = paypalReceive({ amount: 100, currency: "CHF", home: "CHF", rate: 1, spreadPercent: 3, feePercent: local.percent, fixedFee: local.fixed });
  assert.equal(chf.fee, 3.95);
  assert.equal(chf.netHome, 96.05);
});

test("PayPal: paying in another currency costs the 4% markup", () => {
  assert.deepEqual(paypalPay({ amount: 100, currency: "EUR", home: "CHF", rate: 0.92, spreadPercent: 4 }), { marketHome: 92, chargedHome: 95.68, extraHome: 3.68 });
});

test("PayPal: nothing to calculate without an amount or a rate, and a fee stays within the payment", () => {
  const base = { currency: "EUR", home: "CHF", spreadPercent: 3, feePercent: 4.69, fixedFee: 0.35 };
  assert.equal(paypalReceive({ ...base, amount: 0, rate: 0.92 }).netHome, 0);
  assert.equal(paypalReceive({ ...base, amount: 100, rate: 0 }).netHome, 0);
  assert.equal(paypalReceive({ ...base, amount: 0.1, rate: 0.92 }).netHome, 0);
  assert.equal(paypalReceive({ ...base, amount: 100, rate: 0.92, feePercent: -5, fixedFee: 0 }).fee, 0);
});

test("wardrobe value counts everything still owned, and nothing sold", () => {
  const value = wardrobeValue([
    { status: "personal", buy_price_chf: 3763.24 },
    { status: "in_stock", buy_price_chf: "2368.86" },
    { status: "listed", buy_price_chf: 100 },
    { status: "sold", buy_price_chf: 999 },
    { status: "personal", buy_price_chf: null },
  ]);
  assert.equal(value.total, 6232.1);
  assert.equal(value.count, 4);
  assert.deepEqual(value.byStatus.personal, { count: 2, total: 3763.24 });
  assert.deepEqual(value.byStatus.listed, { count: 1, total: 100 });
  assert.deepEqual(wardrobeValue([]).total, 0);
});

test("what you got in a trade costs what yours did, adjusted for cash", async () => {
  const { tradeCost } = await import("../src/lib/metrics");
  assert.equal(tradeCost(40, 0, 0), 40);
  assert.equal(tradeCost(40, 15.5, 0), 55.5);
  assert.equal(tradeCost(40, 0, 10), 30);
  assert.equal(tradeCost(40, 0, 60), 0, "never below zero");
});

test("traded items say Traded", async () => {
  const { statusLabel } = await import("../src/lib/types");
  assert.equal(statusLabel({ status: "sold", sales: { kind: "trade" } }), "Traded");
  assert.equal(statusLabel({ status: "sold", sales: { kind: "sale" } }), "Sold");
  assert.equal(statusLabel({ status: "personal", sales: null }), "Personal");
});
