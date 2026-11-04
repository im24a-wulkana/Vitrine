export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-3 p-6">
      <p className="eyebrow">No connection</p>
      <h1 className="page-title">You&apos;re offline.</h1>
      <p className="text-muted-foreground">Vitrine needs a connection to load your data. Try again when you&apos;re back online.</p>
    </main>
  );
}
