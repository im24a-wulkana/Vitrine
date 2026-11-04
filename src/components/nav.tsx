"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, LayoutGrid, Menu, Plus, Shirt } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/inventory", label: "Stock", icon: LayoutGrid },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/items/new", label: "Add", icon: Plus, primary: true },
  { href: "/dashboard", label: "Numbers", icon: BarChart3 },
  { href: "/more", label: "More", icon: Menu },
];

const MORE_PATHS = ["/more", "/alerts", "/outfits", "/expenses", "/wishlist", "/import", "/settings"];

export function Nav({ alertCount }: { alertCount: number }) {
  const pathname = usePathname();
  const isActive = (href: string) => {
    if (href === "/more") return MORE_PATHS.some((p) => pathname.startsWith(p));
    if (href === "/inventory") return pathname.startsWith("/inventory") || (pathname.startsWith("/items/") && pathname !== "/items/new");
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop */}
      <header className="sticky top-0 z-30 hidden border-b bg-background md:block">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-8 px-6">
          <Link href="/inventory" className="font-heading text-2xl">Vitrine</Link>
          <nav className="flex flex-1 items-center gap-6 text-sm">
            {TABS.filter((t) => !t.primary).map((t) => (
              <Link key={t.href} href={t.href} className={cn("relative py-1 text-muted-foreground hover:text-foreground", isActive(t.href) && "text-foreground underline underline-offset-8")}>
                {t.label}
                {t.href === "/more" && alertCount > 0 && <span className="num ml-1 bg-foreground px-1 text-[10px] text-background">{alertCount}</span>}
              </Link>
            ))}
          </nav>
          <Link href="/items/new" className="inline-flex h-9 items-center gap-1.5 bg-foreground px-3 text-sm text-background">
            <Plus className="size-4" /> Add item
          </Link>
        </div>
      </header>

      {/* Mobile: thumb-reach tabs, with Add always one tap away */}
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-background md:hidden">
        <div className="grid h-16 grid-cols-5">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={isActive(t.href) ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground",
                isActive(t.href) && "text-foreground",
                t.primary && "bg-foreground text-background",
              )}
            >
              <t.icon className="size-5" strokeWidth={1.5} />
              {t.label}
              {t.href === "/more" && alertCount > 0 && (
                <span className="num absolute top-2 left-1/2 ml-2 bg-foreground px-1 text-[10px] text-background">{alertCount}</span>
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
