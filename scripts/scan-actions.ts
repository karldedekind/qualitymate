import { runScans } from "@/lib/actions";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[scan-actions] DATABASE_URL is required");
    process.exit(1);
  }
  const result = await runScans();
  console.log(
    `[scan-actions] dueSoonNotified=${result.dueSoonNotified} overdueNotified=${result.overdueNotified} events=${result.events.length}`,
  );
  for (const e of result.events) {
    const id = e.action.id;
    if (e.kind === "due_soon") {
      console.log(`  - due-soon ${id} (${e.daysUntilDue}d) ${e.action.title}`);
    } else {
      console.log(`  - overdue  ${id} (${e.daysOverdue}d) ${e.action.title}`);
    }
  }
}

main().catch((err) => {
  console.error("[scan-actions] failed:", err);
  process.exit(1);
});
