import { NextResponse } from "next/server";
import { buildBackup } from "@/lib/backup";
import { unauthorized } from "@/lib/csv-response";
import { localDate } from "@/lib/format";
import { getUser } from "@/lib/session";

export async function GET() {
  const { db, user } = await getUser();
  if (!user) return unauthorized();

  try {
    const backup = await buildBackup(db);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="vitrine-backup-${localDate()}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Backup failed" }, { status: 500 });
  }
}
