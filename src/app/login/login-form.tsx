"use client";

import { useActionState, useState } from "react";
import { createAuthClient } from "@neon/auth/next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/actions/session";

const authClient = createAuthClient();

export function LoginForm({ denied, googleFailed }: { denied: boolean; googleFailed: boolean }) {
  const initial = denied ? "This account doesn't have access to Vitrine." : googleFailed ? "Google sign-in didn't work. Try again." : null;
  const [state, action, pending] = useActionState(signIn, initial ? { error: initial } : null);
  const [google, setGoogle] = useState<"idle" | "pending" | "failed">("idle");

  // Google proves who someone is, not that they're allowed in: the access check still
  // runs when they land on /closet, and sends anyone not on the list back here.
  async function signInWithGoogle() {
    setGoogle("pending");
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/closet`,
      errorCallbackURL: `${window.location.origin}/login?google=failed`,
    }).catch(() => ({ error: true }));
    if (error) setGoogle("failed");
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {google === "failed" ? (
        <p role="alert" className="text-sm font-medium">Couldn&apos;t reach Google. Try again.</p>
      ) : (
        state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>
      )}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "One moment…" : "Sign in"}</Button>
      <Button type="button" size="lg" variant="outline" disabled={google === "pending"} onClick={signInWithGoogle}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 11v3.2h5.4c-.2 1.4-1.6 4-5.4 4-3.3 0-5.9-2.7-5.9-6.2S8.700 5.800 12 5.800c1.900 0 3.100.8 3.800 1.500l2.600-2.500C16.800 3.300 14.600 2.300 12 2.300 6.700 2.300 2.400 6.600 2.400 12s4.300 9.700 9.600 9.700c5.500 0 9.200-3.900 9.200-9.400 0-.6-.1-1.100-.2-1.300H12z" />
        </svg>
        {google === "pending" ? "One moment…" : "Continue with Google"}
      </Button>
    </form>
  );
}
