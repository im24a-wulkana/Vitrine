"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "@/lib/actions/session";

export function LoginForm({ denied }: { denied: boolean }) {
  const [state, action, pending] = useActionState(signIn, denied ? { error: "This account doesn't have access to Vitrine." } : null);

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
      {state?.error && <p role="alert" className="text-sm font-medium">{state.error}</p>}
      <Button type="submit" size="lg" disabled={pending}>{pending ? "One moment…" : "Sign in"}</Button>
    </form>
  );
}
