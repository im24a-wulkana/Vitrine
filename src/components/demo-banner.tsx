import { signOut } from "@/lib/actions/session";

/** Shown on every page of the demo, so nobody mistakes it for their own closet. */
export function DemoBanner() {
  return (
    <div role="note" className="mb-4 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
      <p className="min-w-0">
        <span className="font-medium">Demo with sample data.</span> <span className="text-muted-foreground">Changes aren&apos;t saved.</span>
      </p>
      <form action={signOut}>
        <button type="submit" className="min-h-11 shrink-0 font-medium underline underline-offset-4">Sign in</button>
      </form>
    </div>
  );
}
