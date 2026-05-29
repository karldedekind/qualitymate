import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "..", "drizzle");

export async function runMigrations(databaseUrl: string): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1 });
  const applied: string[] = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS __migrations (
      name text PRIMARY KEY,
      applied_at timestamp NOT NULL DEFAULT now()
    )`;
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const exists = await sql`SELECT 1 FROM __migrations WHERE name = ${file}`;
      if (exists.length > 0) continue;

      const content = readFileSync(join(migrationsDir, file), "utf-8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO __migrations (name) VALUES (${file})`;
      });
      applied.push(file);
      console.log(`[migrate] applied ${file}`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  return applied;
}

const isCliEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCliEntry) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }
  runMigrations(url)
    .then((applied) => {
      console.log(`[migrate] complete (${applied.length} applied)`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}
