import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ google?: string }> }) {
  const { google } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 p-6">
      <div>
        <h1 className="wordmark text-6xl leading-none">Vitrine</h1>
        <p className="eyebrow mt-3">Wardrobe &amp; resale ledger</p>
      </div>
      <div className="flex flex-col gap-3">
        <LoginForm googleFailed={google === "failed"} />
        <a href="/demo" className="inline-flex min-h-11 items-center justify-center text-sm text-muted-foreground underline underline-offset-4">
          Look around without signing in
        </a>
      </div>
    </main>
  );
}
