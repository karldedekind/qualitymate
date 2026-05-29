import { scanAllJobs } from "@/lib/anomaly";
import { todayIsoUtc } from "@/lib/roster";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[scan-anomalies] DATABASE_URL is required");
    process.exit(1);
  }
  const date = process.argv[2] ?? todayIsoUtc();
  const result = await scanAllJobs(date);
  console.log(
    `[scan-anomalies] date=${date} scanned=${result.scanned} triggered=${result.triggered.length} notifiedAdmins=${result.notifiedAdmins}`,
  );
  for (const t of result.triggered) {
    console.log(
      `  - ${t.jobNumber}: ${t.unknownCount} unknown companies (${t.unknownCompanies.join(", ")})`,
    );
  }
}

main().catch((err) => {
  console.error("[scan-anomalies] failed:", err);
  process.exit(1);
});
