import { test } from "node:test";
import assert from "node:assert/strict";
import { guessMapping, mapRow, parseAmount, parseCsv, parseDate, toCsv, type ColumnMapping } from "../src/lib/csv";
import { daysBetween, rankBrands } from "../src/lib/format";
import { closetTab } from "../src/lib/types";
import {
  costPerWear, feeFor, groupSales, isUnworn, listingAgeDays, netProfit, profitByMonth,
  suggestedMarkdown, summarize, yearlySummary, type SaleRow,
} from "../src/lib/metrics";

const TODAY = "2026-11-04";

function sale(overrides: Partial<SaleRow> = {}): SaleRow {
  return {
    sold_at: "2026-11-01", platform: "Vinted", sale_price: 200, fees: 20, shipping_cost: 10,
    item_cost_chf: 100, net_profit: 70, brand: "A", started_at: "2026-10-22", ...overrides,
  };
}

test("fee preset combines percent and fixed, and rounds to cents", () => {
  assert.equal(feeFor({ fee_percent: 9, fee_fixed: 0.7 }, 133.33), 12.7);
  assert.equal(feeFor(undefined, 100), 0);
  assert.equal(feeFor({ fee_percent: 9, fee_fixed: 1 }, 0), 0);
});

test("live net profit uses the same formula as the database column", () => {
  assert.equal(netProfit(250, 20, 10, 100), 120);
  assert.equal(netProfit(50, 10, 10, 100), -70);
});

test("summarize filters by period and subtracts expenses", () => {
  const sales = [sale(), sale({ sold_at: "2026-02-01", net_profit: 30, sale_price: 100 }), sale({ sold_at: "2025-02-01", net_profit: 500 })];
  const expenses = [{ date: "2026-11-02", amount_chf: 15 }, { date: "2025-01-01", amount_chf: 100 }];

  const month = summarize(sales, expenses, "month", TODAY);
  assert.equal(month.salesCount, 1);
  assert.equal(month.netProfit, 55);

  assert.equal(summarize(sales, expenses, "year", TODAY).tradingProfit, 100);
  assert.equal(summarize(sales, expenses, "all", TODAY).netProfit, 600 - 115);
});

test("ROI skips zero-cost items and days-to-sell skips unknown start dates", () => {
  const s = summarize(
    [sale({ item_cost_chf: 100, net_profit: 50 }), sale({ item_cost_chf: 0, net_profit: 80, started_at: null })],
    [], "all", TODAY,
  );
  assert.equal(s.avgRoi, 0.5);
  assert.equal(s.avgDaysToSell, 10);
});

test("an empty dashboard shows no ROI rather than 0%", () => {
  const s = summarize([], [], "all", TODAY);
  assert.equal(s.avgRoi, null);
  assert.equal(s.avgDaysToSell, null);
  assert.equal(s.netProfit, 0);
});

test("profitByMonth covers 12 months including empty ones, across a year boundary", () => {
  const points = profitByMonth([sale({ sold_at: "2026-01-15", net_profit: 40 })], [{ date: "2026-01-20", amount_chf: 15 }], "2026-03-31");
  assert.equal(points.length, 12);
  assert.equal(points[0].month, "2025-04");
  assert.equal(points[11].month, "2026-03");
  assert.equal(points.find((p) => p.month === "2026-01")?.profit, 25);
  assert.equal(points.find((p) => p.month === "2026-02")?.profit, 0);
});

test("groupSales ranks by profit", () => {
  const groups = groupSales([sale({ brand: "A", net_profit: 10 }), sale({ brand: "B", net_profit: 50 }), sale({ brand: "A", net_profit: 5 })], "brand", "all", TODAY);
  assert.deepEqual(groups.map((g) => [g.name, g.profit, g.count]), [["B", 50, 1], ["A", 15, 2]]);
});

test("yearlySummary totals match the sum of its months", () => {
  const { months, total } = yearlySummary(
    [sale({ sold_at: "2026-03-01" }), sale({ sold_at: "2026-03-09" }), sale({ sold_at: "2026-07-01" }), sale({ sold_at: "2025-07-01" })],
    [{ date: "2026-03-05", amount_chf: 12.5 }],
    2026,
  );
  assert.equal(months.length, 12);
  assert.equal(months[2].sales, 2);
  assert.equal(total.sales, 3);
  assert.equal(total.profit, 210);
  assert.equal(total.net, 197.5);
});

test("a markdown restarts the aging clock", () => {
  const listing = { listed_at: "2026-08-01T10:00:00Z", list_price: 100 };
  assert.equal(listingAgeDays(listing, TODAY), 95);
  assert.equal(listingAgeDays({ ...listing, price_changes: [{ changed_at: "2026-11-01T10:00:00Z" }] }, TODAY), 3);
  assert.equal(suggestedMarkdown(245, 10), 221);
});

test("cost per wear", () => {
  assert.equal(costPerWear(300, 4), 75);
  assert.equal(costPerWear(300, 0), null);
});

test("unworn: 6 months from last wear, or from purchase if never worn", () => {
  assert.equal(isUnworn("2026-01-01", "2020-01-01", TODAY), true);
  assert.equal(isUnworn("2026-10-01", "2020-01-01", TODAY), false);
  assert.equal(isUnworn(null, "2026-10-28", TODAY), false);
  assert.equal(isUnworn(null, "2026-01-28", TODAY), true);
});

test("daysBetween counts calendar days", () => {
  assert.equal(daysBetween("2026-01-01", "2026-01-31"), 30);
  assert.equal(daysBetween("2026-01-01T23:59:00Z", "2026-01-02T00:01:00Z"), 1);
});

test("rankBrands merges case variants and sorts by use", () => {
  assert.deepEqual(rankBrands([{ brand: "Acne" }, { brand: "Lemaire" }, { brand: "acne " }]), ["Acne", "Lemaire"]);
});

test("parseCsv handles quotes, embedded newlines, BOM and semicolons", () => {
  assert.deepEqual(parseCsv('﻿a,b\r\n"x, y","line1\nline2"\r\n'), [["a", "b"], ["x, y", "line1\nline2"]]);
  assert.deepEqual(parseCsv('a;b\n1;"say ""hi"""\n'), [["a", "b"], ["1", 'say "hi"']]);
  assert.deepEqual(parseCsv("a,b\n\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("parseAmount reads Swiss, European and US formats", () => {
  for (const [raw, expected] of [
    ["1200.50", 1200.5], ["1'200.50", 1200.5], ["1’200.50", 1200.5], ["1,200.50", 1200.5],
    ["1.200,50", 1200.5], ["80,5", 80.5], ["CHF 80", 80], ["", null], ["abc", null],
  ] as const) {
    assert.equal(parseAmount(raw), expected, raw);
  }
});

test("parseDate reads ISO and Swiss dates and rejects impossible ones", () => {
  assert.equal(parseDate("2026-03-05"), "2026-03-05");
  assert.equal(parseDate("5.3.2026"), "2026-03-05");
  assert.equal(parseDate("05/03/2026"), "2026-03-05");
  assert.equal(parseDate("31.02.2026"), null);
  assert.equal(parseDate("soon"), null);
});

test("guessMapping prefers exact headers and uses each column once", () => {
  const m = guessMapping(["Brand", "Item name", "Sale Price", "Buy Price", "Fees", "Sold Date"]);
  assert.equal(m.brand, 0);
  assert.equal(m.name, 1);
  assert.equal(m.sale_price, 2);
  assert.equal(m.buy_price, 3);
  assert.equal(m.fees, 4);
  assert.equal(m.sold_at, 5);
});

const MAP: ColumnMapping = { brand: 0, name: 1, status: 2, buy_price: 3, buy_currency: 4, buy_price_chf: 5, sale_price: 6, platform: 7 };

test("mapRow: a plain row", () => {
  const r = mapRow(["Acne", "Coat", "", "100", "", "", "", ""], MAP, TODAY);
  assert.ok(r.ok);
  assert.equal(r.row.status, "in_stock");
  assert.equal(r.row.buy_price_chf, 100);
});

test("mapRow: a foreign price without a CHF value is an error, never a silent zero", () => {
  const r = mapRow(["Acne", "Coat", "", "100", "EUR", "", "", ""], MAP, TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errors[0], /CHF value/);
});

test("mapRow: a sold item needs a sale price", () => {
  const r = mapRow(["Acne", "Coat", "sold", "100", "", "", "", ""], MAP, TODAY);
  assert.equal(r.ok, false);
});

test("mapRow: infers sold from a sale price", () => {
  const r = mapRow(["Acne", "Coat", "", "100", "", "", "250", "Vinted"], MAP, TODAY);
  assert.ok(r.ok);
  assert.equal(r.row.status, "sold");
  assert.deepEqual(r.row.sale, { platform: "Vinted", sale_price: 250, fees: 0, shipping_cost: 0, sold_at: TODAY });
});

test("mapRow: reports every problem on a bad row", () => {
  const r = mapRow(["", "", "lost", "abc", "", "", "", ""], MAP, TODAY);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.errors.length, 4);
});

test("toCsv neutralises spreadsheet formulas but leaves numbers alone", () => {
  const out = toCsv([["=HYPERLINK(1)", -5, "a,b", null]]);
  assert.equal(out, "﻿'=HYPERLINK(1),-5,\"a,b\",\r\n");
});

test("an export can be parsed back and imported", () => {
  const csv = toCsv([
    ["brand", "name", "status", "buy_price", "buy_currency", "buy_price_chf", "sale_price", "platform"],
    ["Acne", 'Coat, "long"', "sold", 100, "EUR", 94.5, 250, "Vinted"],
  ]);
  const [header, row] = parseCsv(csv);
  const r = mapRow(row, guessMapping(header), TODAY);
  assert.ok(r.ok);
  assert.equal(r.row.name, 'Coat, "long"');
  assert.equal(r.row.buy_price_chf, 94.5);
  assert.equal(r.row.sale?.sale_price, 250);
});

test("closetTab maps older and imported category names to a tab", () => {
  assert.equal(closetTab("Tops"), "Tops");
  assert.equal(closetTab("knitwear"), "Tops");
  assert.equal(closetTab("Footwear"), "Shoes");
  assert.equal(closetTab("Bags"), "Accessories");
  assert.equal(closetTab("Something else"), null);
  assert.equal(closetTab(null), null);
});
