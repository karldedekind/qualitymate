import { sendHeartbeat } from "@/lib/heartbeat";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[heartbeat] DATABASE_URL is required");
    process.exit(1);
  }
  const result = await sendHeartbeat();
  if (result.ok) {
    console.log(`[heartbeat] sent (HTTP ${result.status})`);
    return;
  }
  if (result.reason === "disabled") {
    console.log("[heartbeat] disabled — skip");
    return;
  }
  if (result.reason === "no_endpoint") {
    console.warn("[heartbeat] enabled but no endpoint configured");
    process.exit(1);
  }
  console.error(
    `[heartbeat] HTTP ${result.status ?? "?"} ${result.message ?? ""}`,
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[heartbeat] failed:", err);
  process.exit(1);
});
