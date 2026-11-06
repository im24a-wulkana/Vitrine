"use client";

import { useState } from "react";
import { createAuthClient } from "@neon/auth/next";
import { Button } from "@/components/ui/button";

const authClient = createAuthClient();

export function LoginForm({ googleFailed }: { googleFailed: boolean }) {
  const [state, setState] = useState<"idle" | "pending" | "failed">(googleFailed ? "failed" : "idle");

  async function signInWithGoogle() {
    setState("pending");
    const { error } = await authClient.signIn
      .social({
        provider: "google",
        callbackURL: `${window.location.origin}/closet`,
        errorCallbackURL: `${window.location.origin}/login?google=failed`,
      })
      .catch(() => ({ error: true }));
    if (error) setState("failed");
  }

  return (
    <div className="flex flex-col gap-4">
      {state === "failed" && <p role="alert" className="text-sm font-medium">Google sign-in didn&apos;t work. Try again.</p>}
      <Button type="button" size="lg" disabled={state === "pending"} onClick={signInWithGoogle}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 11v3.2h5.4c-.2 1.4-1.6 4-5.4 4-3.3 0-5.9-2.7-5.9-6.2S8.7 5.8 12 5.8c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.700 9.600 9.700c5.500 0 9.200-3.900 9.200-9.400 0-.6-.1-1.100-.2-1.300H12z" />
        </svg>
        {state === "pending" ? "One moment…" : "Continue with Google"}
      </Button>
    </div>
  );
}
