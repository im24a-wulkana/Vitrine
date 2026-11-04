"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, CalendarDays, Layers, Plus, Shirt } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BUSINESS_LINKS } from "@/lib/business-links";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/closet", label: "Closet", icon: Shirt, also: ["/items/", "/wardrobe"] },
  { href: "/outfits", label: "Outfits", icon: Layers },
  { href: "/items/new", label: "Add", icon: Plus, primary: true },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/dashboard", label: "Business", icon: BriefcaseBusiness, also: ["/shipping", "/alerts", "/lots", "/calculator", "/expenses", "/wishlist", "/import", "/settings"] },
];

export function Nav({ alertCount }: { alertCount: number }) {
  const pathname = usePathname();
  const isActive = (tab: (typeof TABS)[number]) => {
    if (pathname === "/items/new") return tab.href === "/items/new";
    return pathname.startsWith(tab.href) || (tab.also ?? []).some((p) => pathname.startsWith(p));
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-background p-5 md:flex">
        <Link href="/closet" className="wordmark text-2xl">Vitrine</Link>
        <nav aria-label="Main" className="mt-8 flex flex-col gap-1">
          {TABS.filter((t) => !t.primary).map((t) => (
            <Link key={t.href} href={t.href} aria-current={isActive(t) ? "page" : undefined} className={cn("flex h-10 items-center gap-3 rounded-lg px-2 text-sm text-muted-foreground hover:text-foreground", isActive(t) && "bg-muted text-foreground")}>
              <t.icon className="size-4" strokeWidth={1.5} />
              {t.label}
              {t.href === "/dashboard" && alertCount > 0 && <span className="num ml-auto rounded-sm bg-foreground px-1 text-[10px] text-background">{alertCount}</span>}
            </Link>
          ))}
        </nav>
        <nav aria-label="Business" className="mt-6 flex flex-col gap-1 border-t pt-4">
          {BUSINESS_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? "page" : undefined} className={cn("px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground", pathname.startsWith(l.href) && "text-foreground underline underline-offset-4")}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3">
          <Link href="/items/new" className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-medium text-background">
            <Plus className="size-4" /> Add item
          </Link>
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile: thumb-reach tabs, with Add always one tap away */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background md:hidden">
        <div className="grid h-16 grid-cols-5 items-center">
          {TABS.map((t) =>
            t.primary ? (
              <Link key={t.href} href={t.href} aria-label="Add item" className="mx-auto grid size-12 place-items-center rounded-full bg-foreground text-background">
                <t.icon className="size-6" strokeWidth={1.5} />
              </Link>
            ) : (
              <Link key={t.href} href={t.href} aria-current={isActive(t) ? "page" : undefined} className={cn("relative flex h-full flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground", isActive(t) && "text-foreground")}>
                <t.icon className="size-5" strokeWidth={1.5} />
                {t.label}
                {t.href === "/dashboard" && alertCount > 0 && <span className="num absolute top-2 left-1/2 ml-2 rounded-sm bg-foreground px-1 text-[10px] text-background">{alertCount}</span>}
              </Link>
            ),
          )}
        </div>
      </nav>
    </>
  );
}
