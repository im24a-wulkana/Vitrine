import Link from "next/link";
import { localDate } from "@/lib/format";
import { getAgingAlerts, getSettings } from "@/lib/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "More" };

export default async function MorePage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const alerts = await getAgingAlerts(supabase, settings, localDate());

  const links = [
    { href: "/alerts", label: "Aging listings", note: alerts.length ? String(alerts.length) : null },
    { href: "/outfits", label: "Outfits" },
    { href: "/expenses", label: "Expenses" },
    { href: "/wishlist", label: "Wishlist" },
    { href: "/import", label: "Import and export" },
    { href: "/settings", label: "Settings" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">More</h1>
      <ul className="border-t">
        {links.map((link) => (
          <li key={link.href} className="border-b">
            <Link href={link.href} className="flex h-14 items-center justify-between font-heading text-2xl">
              {link.label}
              {link.note && <span className="num bg-foreground px-1.5 text-sm text-background">{link.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
