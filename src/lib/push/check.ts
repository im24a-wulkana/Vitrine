// Decides which notifications are due for one user, and sends them.
//
// Every query here filters by user id explicitly. The scheduled job runs as the
// database owner, which bypasses row level security, so nothing else protects
// one account's data from reaching another account's phone.
import { listingAgeDays } from "../metrics";

export interface PushState {
  today: string;
  agingCount: number;
  toShipCount: number;
  monthNet: number;
  goal: number | null;
}

export interface PushMessage {
  key: string;
  title: string;
  body: string;
  url: string;
}

/** ISO week, so an aging reminder goes out at most once a week. */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function dueMessages(state: PushState): PushMessage[] {
  const messages: PushMessage[] = [];
  if (state.agingCount > 0) {
    messages.push({
      key: `aging:${isoWeek(state.today)}`,
      title: "Listings sitting too long",
      body: `${state.agingCount} ${state.agingCount === 1 ? "listing could" : "listings could"} use a markdown.`,
      url: "/alerts",
    });
  }
  if (state.toShipCount > 0) {
    messages.push({
      key: `to-ship:${state.today}`,
      title: "Sales waiting to ship",
      body: `${state.toShipCount} ${state.toShipCount === 1 ? "sale needs" : "sales need"} shipping.`,
      url: "/shipping",
    });
  }
  if (state.goal !== null && state.goal > 0 && state.monthNet >= state.goal) {
    messages.push({
      key: `goal:${state.today.slice(0, 7)}`,
      title: "Profit goal reached",
      body: `You've hit your goal of ${state.goal} CHF this month.`,
      url: "/dashboard",
    });
  }
  return messages;
}

export interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export type PushResult = "sent" | "gone" | "failed";
export type PushSender = (subscription: Subscription, message: PushMessage) => Promise<PushResult>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = { from: (table: string) => any };

type ItemRow = {
  listings: { listed_at: string; delisted_at: string | null; price_changes: { changed_at: string }[] }[];
  sales: { sold_at: string; net_profit: number; shipping_status: string } | null;
};

export async function loadPushState(client: Client, userId: string, today: string): Promise<PushState> {
  const [{ data: settings }, { data: items, error }, { data: expenses, error: expenseError }] = await Promise.all([
    client.from("user_settings").select("aging_threshold_days, monthly_profit_goal_chf").eq("user_id", userId).maybeSingle(),
    client.from("items").select("id, listings(listed_at, delisted_at, price_changes(changed_at)), sales(sold_at, net_profit, shipping_status)").eq("user_id", userId),
    client.from("expenses").select("date, amount_chf").eq("user_id", userId),
  ]);
  if (error) throw new Error(error.message);
  if (expenseError) throw new Error(expenseError.message);

  const threshold = settings?.aging_threshold_days ?? 30;
  const rows = (items ?? []) as ItemRow[];
  const month = today.slice(0, 7);

  const agingCount = rows
    .flatMap((i) => i.listings)
    .filter((l) => !l.delisted_at && listingAgeDays({ ...l, list_price: null }, today) >= threshold).length;
  const sales = rows.flatMap((i) => (i.sales ? [i.sales] : []));
  const profit = sales.filter((s) => s.sold_at.startsWith(month)).reduce((sum, s) => sum + Number(s.net_profit), 0);
  const spent = ((expenses ?? []) as { date: string; amount_chf: number }[])
    .filter((e) => e.date.startsWith(month))
    .reduce((sum, e) => sum + Number(e.amount_chf), 0);

  return {
    today,
    agingCount,
    toShipCount: sales.filter((s) => s.shipping_status === "to_ship").length,
    monthNet: profit - spent,
    goal: settings?.monthly_profit_goal_chf ?? null,
  };
}

/**
 * Sends what's due and not yet sent. A message is only recorded as sent once a
 * device has received it, so a failed attempt is retried on the next check.
 * Subscriptions the push service says are gone get removed.
 */
export async function runPushCheck(client: Client, userId: string, today: string, send: PushSender): Promise<{ sent: number; removed: number }> {
  const { data: subs, error } = await client.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const subscriptions = (subs ?? []) as Subscription[];
  if (subscriptions.length === 0) return { sent: 0, removed: 0 };

  const { data: log, error: logError } = await client.from("push_log").select("key").eq("user_id", userId);
  if (logError) throw new Error(logError.message);
  const alreadySent = new Set(((log ?? []) as { key: string }[]).map((row) => row.key));

  const due = dueMessages(await loadPushState(client, userId, today)).filter((m) => !alreadySent.has(m.key));

  let sent = 0;
  const gone = new Set<string>();
  for (const message of due) {
    const live = subscriptions.filter((s) => !gone.has(s.id));
    const results = await Promise.all(live.map((s) => send(s, message)));
    results.forEach((result, i) => {
      if (result === "gone") gone.add(live[i].id);
    });
    if (results.includes("sent")) {
      const { error: writeError } = await client.from("push_log").insert({ user_id: userId, key: message.key });
      if (writeError) throw new Error(writeError.message);
      sent += 1;
    }
  }
  if (gone.size) await client.from("push_subscriptions").delete().in("id", [...gone]);
  return { sent, removed: gone.size };
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/, /^web\.push\.apple\.com$/];

/** The server later posts to this address, so only real browser push services are accepted. */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}
