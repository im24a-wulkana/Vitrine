import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateFees, paypalPay, paypalReceive } from "../src/lib/fees";
import { feeFor } from "../src/lib/metrics";

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

test("PayPal: EUR sale from the EEA, then converted to CHF", () => {
  const r = paypalReceive({ amount: 100, currency: "EUR", rate: 0.92, spreadPercent: 3, goods: true, region: "eea" });
  // Fee 4.69% + 0.35 EUR = 5.04 EUR. 94.96 EUR x 0.92 = 87.36 CHF, less 3%.
  assert.equal(r.fee, 5.04);
  assert.equal(r.feeChf, 4.64);
  assert.equal(r.marketChf, 92);
  assert.equal(r.conversionCostChf, 2.62);
  assert.equal(r.netChf, 84.74);
  assert.equal(r.lostPercent, 7.89);
});

test("PayPal: friends payment has no sale fee, CHF has no conversion", () => {
  const friends = paypalReceive({ amount: 100, currency: "USD", rate: 0.82, spreadPercent: 3, goods: false, region: "other" });
  assert.equal(friends.fee, 0);
  assert.equal(friends.netChf, 79.54);
  const chf = paypalReceive({ amount: 100, currency: "CHF", rate: 1, spreadPercent: 3, goods: true, region: "ch" });
  assert.equal(chf.fee, 3.95);
  assert.equal(chf.conversionCostChf, 0);
  assert.equal(chf.netChf, 96.05);
});

test("PayPal: paying in another currency costs the 4% markup", () => {
  assert.deepEqual(paypalPay({ amount: 100, currency: "EUR", rate: 0.92, spreadPercent: 4 }), { marketChf: 92, chargedChf: 95.68, extraChf: 3.68 });
  assert.equal(paypalPay({ amount: 100, currency: "CHF", rate: 1, spreadPercent: 4 }).extraChf, 0);
});

test("PayPal: nothing to calculate without an amount or a rate", () => {
  assert.equal(paypalReceive({ amount: 0, currency: "EUR", rate: 0.92, spreadPercent: 3, goods: true, region: "eea" }).netChf, 0);
  assert.equal(paypalReceive({ amount: 100, currency: "EUR", rate: 0, spreadPercent: 3, goods: true, region: "eea" }).netChf, 0);
  assert.equal(paypalPay({ amount: 100, currency: "EUR", rate: 0, spreadPercent: 4 }).chargedChf, 0);
});

test("PayPal: a tiny sale can't lose more than it received", () => {
  const r = paypalReceive({ amount: 0.1, currency: "CHF", rate: 1, spreadPercent: 0, goods: true, region: "ch" });
  assert.equal(r.netChf, 0);
});
