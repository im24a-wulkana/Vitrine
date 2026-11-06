import { FeeCalculator } from "@/components/fee-calculator";
import { requireUser } from "@/lib/session";
import type { Platform } from "@/lib/types";

export const metadata = { title: "Fees" };

export default async function FeesPage() {
  const { db } = await requireUser();
  const { data: platforms } = await db.from("platforms").select("*").order("name");
  return <FeeCalculator platforms={(platforms ?? []) as Platform[]} />;
}
