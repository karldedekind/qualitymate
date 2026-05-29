import Link from "next/link";

export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-semibold mb-2">You&apos;re offline</h1>
      <p className="text-slate-600 max-w-md mb-4">
        QualityMate can&apos;t reach the server right now. Anything you submit while offline
        is saved on this device and will sync automatically when you&apos;re back online.
      </p>
      <Link href="/incidents/new" className="text-blue-700 underline">
        File an incident (works offline)
      </Link>
    </main>
  );
}
