"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PushSettings } from "@/components/push-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import { resetLocalData } from "@/lib/actions/local";
import { clearLocation, deletePlatform, savePlatform, saveSettings, setCity, signOut } from "@/lib/actions/records";
import { isLocalMode } from "@/lib/mode";
import { CURRENCIES, type Platform, type UserSettings } from "@/lib/types";

function PlatformRow({ platform }: { platform?: Platform }) {
  const [name, setName] = useState(platform?.name ?? "");
  const [percent, setPercent] = useState(platform ? String(platform.fee_percent) : "");
  const [fixed, setFixed] = useState(platform ? String(platform.fee_fixed) : "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await savePlatform({ id: platform?.id, name, fee_percent: Number(percent || 0), fee_fixed: Number(fixed || 0) });
      if (!res.ok) return setError(res.error);
      if (platform) setSaved(true);
      else {
        setName("");
        setPercent("");
        setFixed("");
      }
    });
  }

  return (
    <li className="border-b py-3">
      <form onSubmit={submit} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_auto] items-end gap-2">
        <div className="col-span-4 flex items-center gap-2 md:col-span-1">
          <Input aria-label="Platform name" placeholder={platform ? undefined : "New platform"} value={name} onChange={(e) => setName(e.target.value)} />
          {platform && (
            <button type="button" aria-label={`Delete ${platform.name}`} disabled={pending} className="grid size-11 shrink-0 place-items-center text-muted-foreground" onClick={() => start(async () => {
              const res = await deletePlatform(platform.id);
              if (!res.ok) setError(res.error);
            })}>
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Fee %</span>
          <Input aria-label="Fee percent" inputMode="decimal" className="num px-2" value={percent} onChange={(e) => setPercent(e.target.value.replace(",", "."))} />
        </div>
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Fixed</span>
          <Input aria-label="Fixed fee" inputMode="decimal" className="num px-2" value={fixed} onChange={(e) => setFixed(e.target.value.replace(",", "."))} />
        </div>
        <Button type="submit" variant="outline" disabled={pending} className="max-md:col-span-2">
          {platform ? (saved ? "Saved" : "Save") : "Add"}
        </Button>
      </form>
      {error && <p role="alert" className="mt-1 text-sm font-medium">{error}</p>}
    </li>
  );
}

function LocalData() {
  const [confirming, setConfirming] = useState<"empty" | "sample" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset(withSample: boolean) {
    setMessage(null);
    start(async () => {
      const res = await resetLocalData(withSample);
      setConfirming(null);
      setMessage(res.ok ? (withSample ? "Sample data loaded." : "Everything was removed.") : res.error);
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow border-b pb-2">Data on this computer</h2>
      <p className="text-sm text-muted-foreground">
        Vitrine is in local mode: no account, and everything is saved in the .vitrine-data folder. Add your Supabase keys to .env.local to move to a hosted database. Local data doesn&apos;t move over automatically, so export it first.
      </p>
      {confirming ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" disabled={pending} onClick={() => reset(confirming === "sample")}>
            {pending ? "Working…" : confirming === "sample" ? "Replace everything" : "Delete everything"}
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(null)}>Cancel</Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={() => setConfirming("empty")}>Start empty</Button>
          <Button type="button" variant="outline" onClick={() => setConfirming("sample")}>Reload sample data</Button>
        </div>
      )}
      {confirming && <p className="text-sm">This permanently deletes every item, photo, sale, expense, outfit and wishlist entry here.</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}

function LocationSettings({ city, hasLocation }: { city: string | null; hasLocation: boolean }) {
  const [name, setName] = useState(city ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <section className="flex flex-col gap-2">
      <h2 className="eyebrow border-b pb-2">Location for weather</h2>
      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          start(async () => {
            const res = await setCity(name);
            if (!res.ok) return setMessage(res.error);
            setName(res.data.city);
            setMessage(`Using ${res.data.city}.`);
          });
        }}
      >
        <Input aria-label="City" placeholder="City" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="outline" disabled={pending}>{pending ? "Finding…" : "Set city"}</Button>
      </form>
      {message && <p role="status" className="text-sm">{message}</p>}
      {hasLocation && (
        <button
          type="button"
          className="self-start py-1 text-sm text-muted-foreground underline underline-offset-4"
          onClick={() =>
            start(async () => {
              const res = await clearLocation();
              setMessage(res.ok ? "Location removed." : res.error);
              if (res.ok) setName("");
            })
          }
        >
          Remove location
        </button>
      )}
      <p className="text-xs text-muted-foreground">Sent to Open-Meteo to get the forecast. Nothing else is shared.</p>
    </section>
  );
}

export function SettingsView({ settings, platforms, email, pushConfigured }: { settings: UserSettings; platforms: Platform[]; email: string; pushConfigured: boolean }) {
  const router = useRouter();
  const [currency, setCurrency] = useState(settings.default_currency);
  const [days, setDays] = useState(String(settings.aging_threshold_days));
  const [markdown, setMarkdown] = useState(String(settings.markdown_percent));
  const [goal, setGoal] = useState(settings.monthly_profit_goal_chf === null ? "" : String(settings.monthly_profit_goal_chf));
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const res = await saveSettings({ default_currency: currency, aging_threshold_days: Number(days), markdown_percent: Number(markdown), monthly_profit_goal_chf: goal === "" ? null : Number(goal) });
      setMessage(res.ok ? "Saved." : res.error);
    });
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <div className="flex items-end justify-between gap-4"><h1 className="page-title">Settings</h1><span className="md:hidden"><ThemeToggle /></span></div>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select id="currency" className="field num" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([...CURRENCIES, currency])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="aging">Alert after, days</Label>
            <Input id="aging" inputMode="numeric" className="num" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="markdown">Markdown, %</Label>
            <Input id="markdown" inputMode="decimal" className="num" value={markdown} onChange={(e) => setMarkdown(e.target.value.replace(",", "."))} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal">Monthly profit goal, CHF</Label>
          <Input id="goal" inputMode="decimal" className="num" placeholder="None" value={goal} onChange={(e) => setGoal(e.target.value.replace(",", "."))} />
        </div>
        <p className="text-xs text-muted-foreground">Currency is the default on the add-item form. Profit is always calculated in CHF.</p>
        {message && <p role="status" className="text-sm">{message}</p>}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button>
      </form>

      <PushSettings configured={pushConfigured} />

      <LocationSettings city={settings.city} hasLocation={settings.lat !== null} />

      <section>
        <h2 className="eyebrow border-b pb-2">Platforms and fees</h2>
        <ul>
          {platforms.map((p) => <PlatformRow key={p.id} platform={p} />)}
          <PlatformRow />
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">New accounts start at 0% because fees vary by account. Enter your own rates. They fill in automatically when you mark an item sold.</p>
      </section>

      {isLocalMode ? <LocalData /> : <section className="flex items-center justify-between gap-4 border-t pt-4 text-sm">
        <span className="truncate text-muted-foreground">{email}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            router.replace("/login");
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </section>}
    </div>
  );
}
