import { NextResponse } from "next/server";
import { toCsv } from "./csv";

export function csvResponse(filename: string, rows: unknown[][]): NextResponse {
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 });
