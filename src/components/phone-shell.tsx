"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";

const TAB_ROOTS = new Set(["/closet", "/outfits", "/items/new", "/calendar", "/dashboard"]);

function parentOf(pathname: string): string {
  if (pathname.startsWith("/items/") || pathname === "/wardrobe") return "/closet";
  if (pathname.startsWith("/outfits/")) return "/outfits";
  if (pathname.startsWith("/lots/")) return "/lots";
  return "/dashboard";
}

/** A Home Screen app has no browser toolbar, so pages below a tab need their own way back. */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (TAB_ROOTS.has(pathname)) return null;
  return (
    <button
      type="button"
      className="-mt-2 mb-2 -ml-2 flex h-11 items-center gap-0.5 pr-3 text-sm text-muted-foreground md:hidden"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(parentOf(pathname)))}
    >
      <ChevronLeft className="size-5" strokeWidth={1.5} />
      Back
    </button>
  );
}

/**
 * Safari doesn't resize the page for the keyboard, so anything pinned to the bottom
 * would end up behind it. This tells the CSS how much of the screen the keyboard covers.
 */
export function KeyboardWatcher() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      // Smaller changes are Safari's toolbar moving, not a keyboard.
      const open = covered > 120;
      document.documentElement.style.setProperty("--keyboard-inset", `${open ? covered : 0}px`);
      document.documentElement.toggleAttribute("data-keyboard", open);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return null;
}

const HINT_KEY = "vitrine.installHintDismissed";
const noSubscribe = () => () => {};

function shouldOfferInstall(): boolean {
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  try {
    return isIos && !installed && localStorage.getItem(HINT_KEY) !== "1";
  } catch {
    return false;
  }
}

/** iPhones have no install prompt, so people only find this by being told. */
export function InstallHint() {
  const eligible = useSyncExternalStore(noSubscribe, shouldOfferInstall, () => false);
  const [dismissed, setDismissed] = useState(false);
  if (!eligible || dismissed) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border p-3 text-sm md:hidden">
      <p className="min-w-0 flex-1">
        <span className="font-medium">Use Vitrine like an app.</span> Tap Share in Safari, then Add to Home Screen. Notifications only work from there.
      </p>
      <button
        type="button"
        aria-label="Dismiss"
        className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center"
        onClick={() => {
          try {
            localStorage.setItem(HINT_KEY, "1");
          } catch {
            // Private browsing: it just comes back next visit.
          }
          setDismissed(true);
        }}
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
