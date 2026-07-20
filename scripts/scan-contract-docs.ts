import { runContractDocScans } from "@/lib/contract-documents";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[scan-contract-docs] DATABASE_URL is required");
    process.exit(1);
  }
  const result = await runContractDocScans();
  console.log(
    `[scan-contract-docs] overdueNotified=${result.overdueNotified} scanned=${result.scanned}`,
  );
}

main().catch((err) => {
  console.error("[scan-contract-docs] failed:", err);
  process.exit(1);
});
