"use client";

import { useEffect } from "react";

/** Applies the theme saved on the account, so a choice made on one device reaches the others. */
export function ThemeSync({ theme }: { theme: "dark" | "light" | null }) {
  useEffect(() => {
    if (!theme) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("vitrine.theme", theme);
  }, [theme]);
  return null;
}
