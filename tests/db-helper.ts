import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { runMigrations } from "@/db/migrate";

let container: StartedPostgreSqlContainer | null = null;
let url: string | null = null;

export async function startEphemeralPostgres(): Promise<string> {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("qualitymate_test")
    .withUsername("qm")
    .withPassword("qm")
    .start();
  url = container.getConnectionUri();
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET ??= "test-secret-32-bytes-minimum-aaaaaaaa";
  process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
  process.env.APP_URL ??= "http://localhost:3000";
  await runMigrations(url);
  return url;
}

export async function stopEphemeralPostgres(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
    url = null;
  }
}

export function currentUrl(): string {
  if (!url) throw new Error("Postgres not started");
  return url;
}
