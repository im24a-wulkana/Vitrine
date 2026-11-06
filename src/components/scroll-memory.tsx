"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { forgetClosetView } from "@/lib/closet-memory";

const isItemPage = (path: string) => path.startsWith("/items/") && path !== "/items/new" && path !== "/items/batch";

/**
 * Coming back from an item returns you to where you were in the list, whichever way
 * you left: Back, a swipe, a link, or the tab bar. Anywhere else starts at the top.
 */
export function ScrollMemory() {
  const pathname = usePathname();
  const current = useRef(pathname);
  const previous = useRef(pathname);
  const positions = useRef(new Map<string, number>());

  useEffect(() => {
    const onScroll = () => positions.current.set(current.current, window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Before the new page's scroll events, so they aren't saved under the old address.
  useLayoutEffect(() => {
    current.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === pathname) return;

    if (!isItemPage(pathname) && pathname !== "/closet") forgetClosetView();

    const target = positions.current.get(pathname);
    if (!isItemPage(from)) {
      positions.current.delete(pathname);
      return;
    }
    if (!target) return;

    // The page can still be filling in, and Next.js scrolls to the top once it arrives.
    let cancelled = false;
    let frames = 0;
    const cancel = () => {
      cancelled = true;
    };
    window.addEventListener("touchstart", cancel, { once: true, passive: true });
    window.addEventListener("wheel", cancel, { once: true, passive: true });
    const stop = () => {
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("wheel", cancel);
    };
    const step = () => {
      if (cancelled || current.current !== pathname) return stop();
      window.scrollTo(0, target);
      frames += 1;
      // Keeps holding briefly, because anything that shifts the page would undo a single jump.
      if (frames < 45) requestAnimationFrame(step);
      else stop();
    };
    requestAnimationFrame(step);
    return () => {
      cancelled = true;
      stop();
    };
  }, [pathname]);

  return null;
}
