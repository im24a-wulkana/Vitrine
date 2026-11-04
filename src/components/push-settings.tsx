"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { checkPushNow, removePushSubscription, savePushSubscription } from "@/lib/actions/push";

function toKeyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

type State = "loading" | "unsupported" | "dev" | "blocked" | "off" | "on";

export function PushSettings({ configured }: { configured: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (process.env.NODE_ENV !== "production") return setState("dev");
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  function enable() {
    setMessage(null);
    start(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "blocked" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toKeyBytes(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string),
        });
        const keys = subscription.toJSON().keys ?? {};
        const res = await savePushSubscription({ endpoint: subscription.endpoint, p256dh: keys.p256dh ?? "", auth: keys.auth ?? "" });
        if (!res.ok) {
          await subscription.unsubscribe();
          return setMessage(res.error);
        }
        setState("on");
      } catch (e) {
        setMessage(e instanceof Error ? `Couldn't turn on notifications: ${e.message}` : "Couldn't turn on notifications.");
      }
    });
  }

  function disable() {
    setMessage(null);
    start(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
    });
  }

  function checkNow() {
    setMessage(null);
    start(async () => {
      const res = await checkPushNow();
      if (!res.ok) return setMessage(res.error);
      setMessage(res.data.sent ? `Sent ${res.data.sent}.` : "Nothing new to send.");
    });
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow border-b pb-2">Notifications</h2>
      <p className="text-sm text-muted-foreground">Aging listings, sales waiting to ship, and reaching your profit goal.</p>
      {!configured ? (
        <p className="text-sm">Not set up yet. Add VAPID keys to .env.local, as the README explains.</p>
      ) : state === "dev" ? (
        <p className="text-sm">Notifications need a production build: run npm run build, then npm run start.</p>
      ) : state === "unsupported" ? (
        <p className="text-sm">This browser doesn&apos;t support notifications. On an iPhone, add Vitrine to your Home Screen first.</p>
      ) : state === "blocked" ? (
        <p className="text-sm">Notifications are blocked for this site. Allow them in your browser&apos;s settings.</p>
      ) : state === "on" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={checkNow}>Check now</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={disable}>Turn off</Button>
        </div>
      ) : state === "off" ? (
        <Button type="button" variant="outline" disabled={pending} onClick={enable}>Turn on notifications</Button>
      ) : null}
      {message && <p role="status" className="text-sm">{message}</p>}
    </section>
  );
}
