import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ denied?: string; google?: string }> }) {
  const { denied, google } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-10 p-6">
      <div>
        <h1 className="wordmark text-6xl leading-none">Vitrine</h1>
        <p className="eyebrow mt-3">Wardrobe &amp; resale ledger</p>
      </div>
      <LoginForm denied={!!denied} googleFailed={google === "failed"} />
    </main>
  );
}
