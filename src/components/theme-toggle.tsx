"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Dark is the default. The choice is kept on this device, and an inline script in the root layout applies it before first paint. */
export function ThemeToggle() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("vitrine.theme", next ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#050505" : "#f5f5f5");
  }

  return (
    <button type="button" aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="inline-flex h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground" onClick={toggle}>
      {dark ? <Sun className="size-4" strokeWidth={1.5} /> : <Moon className="size-4" strokeWidth={1.5} />}
      {dark ? "Light mode" : "Dark mode"}
    </button>
  );
}
