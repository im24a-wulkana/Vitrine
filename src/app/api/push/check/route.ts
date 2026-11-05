import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createDbClient } from "@/lib/db/client";
import { ownerRunner } from "@/lib/db/neon";
import { localDate } from "@/lib/format";
import { isLocalMode } from "@/lib/mode";
import { runPushCheck } from "@/lib/push/check";
import { createPushSender, isPushConfigured } from "@/lib/push/sender";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The scheduled check for every account with a subscribed device. Vercel Cron calls this. */
export async function GET(request: NextRequest) {
  if (isLocalMode) return NextResponse.json({ error: "Scheduled checks need the hosted database. Use Settings to check now." }, { status: 404 });
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  // Reads across accounts, so runPushCheck filters every query by user id.
  const admin = createDbClient(ownerRunner());
  const { data, error } = await admin.from("push_subscriptions").select("user_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const send = createPushSender();
  const today = localDate();
  let sent = 0;
  let failedUsers = 0;
  for (const userId of new Set<string>((data ?? []).map((row: { user_id: string }) => row.user_id))) {
    try {
      sent += (await runPushCheck(admin, userId, today, send)).sent;
    } catch {
      // One account's failure must not stop the others.
      failedUsers += 1;
    }
  }
  return NextResponse.json({ sent, failedUsers });
}
