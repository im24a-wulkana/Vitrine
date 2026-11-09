import { NextResponse, type NextRequest } from "next/server";

/**
 * Returns how much one unit of `from` is worth in `to` (CHF unless given) on `date`,
 * using ECB reference rates from Frankfurter. The add-item form uses this to prefill
 * the CHF price, and the PayPal calculator for any pair. Callers must handle failure.
 */
export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "CHF";
  const date = request.nextUrl.searchParams.get("date") ?? "";

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) return NextResponse.json({ error: "Invalid currency" }, { status: 400 });
  if (from === to) return NextResponse.json({ rate: 1 });

  const today = new Date().toISOString().slice(0, 10);
  const when = /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today ? date : "latest";

  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${when}?base=${from}&symbols=${to}`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });
    const body = await res.json();
    const rate = body?.rates?.[to];
    if (typeof rate !== "number") return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });
    return NextResponse.json({ rate });
  } catch {
    return NextResponse.json({ error: "Rate unavailable" }, { status: 502 });
  }
}
