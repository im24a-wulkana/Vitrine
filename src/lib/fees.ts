// Published marketplace and PayPal fees for a seller in Switzerland, as of November 2026.
// These change, so the fee pages link to their sources and a rate in Settings always wins.

export interface FeeLine {
  label: string;
  amount: number;
}

export interface FeeEstimate {
  lines: FeeLine[];
  total: number;
  net: number;
  /** Where the numbers came from. */
  basis: "published" | "settings" | "none";
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Only used for Grailed's price tier and fixed fees, which are set in US dollars. Rate from 5 Nov 2026. */
export const CHF_PER_USD = 0.82;

/** PayPal Switzerland's rate for selling goods. The fixed part depends on the currency received. */
export const PAYPAL_PERCENT = 3.4;
export const PAYPAL_FIXED: Record<string, number> = { CHF: 0.55, EUR: 0.35, USD: 0.3, GBP: 0.2, JPY: 40 };
/** Added to PAYPAL_PERCENT when the buyer's PayPal account is in another country. */
export const PAYPAL_REGIONS = [
  { id: "ch", label: "Switzerland", percent: 0 },
  { id: "eea", label: "EEA or UK", percent: 1.29 },
  { id: "other", label: "Rest of world", percent: 1.99 },
] as const;
export type PaypalRegion = (typeof PAYPAL_REGIONS)[number]["id"];
/** Above the base exchange rate: converting money you received, or paying in another currency. */
export const PAYPAL_RECEIVE_SPREAD = 3;
export const PAYPAL_PAY_SPREAD = 4;

type Schedule = (priceChf: number) => FeeLine[];

const SCHEDULES: Record<string, Schedule> = {
  // Paid by the buyer at checkout, so nothing comes out of the sale.
  vinted: () => [],
  // Classifieds: buyer and seller settle it between them.
  tutti: () => [],
  // 12% for fashion. Other categories are 8 to 12%.
  ricardo: (price) => [{ label: "Success fee, 12%", amount: Math.min(290, Math.max(0.1, price * 0.12)) }],
  "vestiaire collective": (price) => {
    if (price < 75) return [{ label: "Selling fee", amount: 12 }, { label: "Payment processing", amount: 3 }];
    return [
      price > 15000 ? { label: "Selling fee", amount: 2500 } : { label: "Selling fee, 17%", amount: price * 0.17 },
      { label: "Payment processing, 3%", amount: Math.max(3, price * 0.03) },
    ];
  },
  grailed: (price) => {
    const dollars = price / CHF_PER_USD;
    const commission = dollars < 120 ? Math.max(1.99 * CHF_PER_USD, price * 0.06) : price * 0.09;
    return [
      { label: dollars < 120 ? "Commission, 6%" : "Commission, 9%", amount: commission },
      { label: "Processing, 4.99% + $0.49", amount: price * 0.0499 + 0.49 * CHF_PER_USD },
    ];
  },
  depop: (price) => [
    { label: "Selling fee, 10%", amount: price * 0.1 },
    { label: `PayPal, ${PAYPAL_PERCENT}% + CHF ${PAYPAL_FIXED.CHF.toFixed(2)}`, amount: (price * PAYPAL_PERCENT) / 100 + PAYPAL_FIXED.CHF },
  ],
};

const scheduleFor = (name: string | undefined) => (name ? SCHEDULES[name.trim().toLowerCase()] : undefined);

export interface FeePlatform {
  name?: string;
  fee_percent: number;
  fee_fixed: number;
}

/** The fee for a sale: the rate in Settings if there is one, otherwise the published fees. */
export function estimateFees(platform: FeePlatform | undefined, price: number): FeeEstimate {
  if (!platform || !(price > 0)) return { lines: [], total: 0, net: Math.max(0, round(price || 0)), basis: "none" };
  const percent = Number(platform.fee_percent);
  const fixed = Number(platform.fee_fixed);
  const schedule = scheduleFor(platform.name);

  let lines: FeeLine[];
  let basis: FeeEstimate["basis"];
  if (percent > 0 || fixed > 0) {
    basis = "settings";
    lines = [];
    if (percent > 0) lines.push({ label: `Your rate, ${percent}%`, amount: (price * percent) / 100 });
    if (fixed > 0) lines.push({ label: "Your fixed fee", amount: fixed });
  } else if (schedule) {
    basis = "published";
    lines = schedule(price);
  } else {
    basis = "none";
    lines = [];
  }
  const rounded = lines.map((line) => ({ label: line.label, amount: round(line.amount) }));
  const total = round(rounded.reduce((sum, line) => sum + line.amount, 0));
  return { lines: rounded, total, net: round(price - total), basis };
}

export interface PaypalReceipt {
  fee: number;
  feeHome: number;
  marketHome: number;
  conversionCostHome: number;
  netHome: number;
  /** Everything PayPal kept, compared with the market rate. */
  lostPercent: number;
}

/**
 * Money received through PayPal in `currency`, then converted to your own currency.
 * `rate` is how much one unit of `currency` is worth in yours. The sale fee is a
 * percentage plus a fixed amount in the currency received.
 */
export function paypalReceive(input: {
  amount: number;
  currency: string;
  home: string;
  rate: number;
  spreadPercent: number;
  feePercent: number;
  fixedFee: number;
}): PaypalReceipt {
  const { amount, rate } = input;
  const none = { fee: 0, feeHome: 0, marketHome: 0, conversionCostHome: 0, netHome: 0, lostPercent: 0 };
  if (!(amount > 0) || !(rate > 0)) return none;

  const fee = Math.min(amount, Math.max(0, (amount * input.feePercent) / 100 + input.fixedFee));
  const spread = input.currency === input.home ? 0 : input.spreadPercent / 100;
  const marketHome = amount * rate;
  const beforeConversion = (amount - fee) * rate;
  const conversionCostHome = beforeConversion * spread;
  const netHome = beforeConversion - conversionCostHome;
  return {
    fee: round(fee),
    feeHome: round(fee * rate),
    marketHome: round(marketHome),
    conversionCostHome: round(conversionCostHome),
    netHome: round(netHome),
    lostPercent: round(((marketHome - netHome) / marketHome) * 100),
  };
}

/** PayPal Switzerland's sale fee, for a Swiss account receiving `currency` from a buyer in `region`. */
export function swissPaypalFee(currency: string, region: PaypalRegion): { percent: number; fixed: number } {
  const extra = PAYPAL_REGIONS.find((r) => r.id === region)?.percent ?? 0;
  return { percent: round(PAYPAL_PERCENT + extra), fixed: PAYPAL_FIXED[currency] ?? 0 };
}

export interface PaypalPayment {
  marketHome: number;
  chargedHome: number;
  extraHome: number;
}

/** Paying for something in `currency` from your own currency, when PayPal does the conversion. */
export function paypalPay(input: { amount: number; currency: string; home: string; rate: number; spreadPercent: number }): PaypalPayment {
  const { amount, rate } = input;
  if (!(amount > 0) || !(rate > 0)) return { marketHome: 0, chargedHome: 0, extraHome: 0 };
  const marketHome = round(amount * rate);
  const chargedHome = round(amount * rate * (1 + (input.currency === input.home ? 0 : input.spreadPercent / 100)));
  return { marketHome, chargedHome, extraHome: round(chargedHome - marketHome) };
}
