import { readFile } from "node:fs/promises";
import { defaultBackupsDir, listBackups, runWeeklyEmail } from "@/lib/backup";
import { isConfigured as smtpConfigured, sendMail } from "@/lib/smtp";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[weekly-email] DATABASE_URL is required");
    process.exit(1);
  }
  const recipient = process.argv[2] ?? process.env.WEEKLY_BACKUP_RECIPIENT;
  if (!recipient) {
    console.error("[weekly-email] recipient required (argv or WEEKLY_BACKUP_RECIPIENT env)");
    process.exit(1);
  }
  const result = await runWeeklyEmail(recipient, defaultBackupsDir(), {
    listBackups,
    smtpConfigured,
    sendMail: async (input) => {
      const r = await sendMail(input);
      return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, error: r.error };
    },
    readFile,
  });
  console.log("[weekly-email] result:", JSON.stringify(result));
  if ("ok" in result && !result.ok) process.exit(1);
}

main().catch((err) => {
  console.error("[weekly-email] failed:", err);
  process.exit(1);
});
