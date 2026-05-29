import { redirect } from "next/navigation";
import { getStatus } from "@/lib/setup-state";
import { SetupForm } from "./form";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ recovery?: string }>;
};

export default async function SetupPage({ searchParams }: Props) {
  const { recovery } = await searchParams;
  const status = await getStatus(recovery ?? null);

  if (status.completed && !status.unlockedByRecovery) {
    redirect("/login");
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-3xl font-semibold mb-2">Welcome to QualityMate</h1>
      <p className="text-slate-600 mb-8">
        Let&apos;s get your install set up. This wizard runs once.
      </p>
      <SetupForm
        initial={{
          companyName: status.companyName ?? "",
          companyShortName: status.companyShortName ?? "",
          primaryColor: status.primaryColor ?? "#1e40af",
        }}
        recoveryToken={status.unlockedByRecovery ? (recovery ?? null) : null}
      />
    </main>
  );
}
