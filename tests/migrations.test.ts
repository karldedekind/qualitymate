import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres, { type Sql } from "postgres";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { runMigrations } from "@/db/migrate";

const EXPECTED_TABLES = [
  "__migrations",
  "account",
  "audit_log",
  "categories",
  "corrective_actions",
  "heartbeat_instances",
  "heartbeats",
  "incident_photos",
  "incidents",
  "invite",
  "jobs",
  "meetings",
  "notifications",
  "register_entries",
  "session",
  "settings",
  "setup_state",
  "site_attendances",
  "user",
  "verification",
];

let container: StartedPostgreSqlContainer | null = null;
let sql: Sql | null = null;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("qm_migrations_test")
    .withUsername("qm")
    .withPassword("qm")
    .start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  sql = postgres(url, { max: 1 });
}, 120_000);

afterAll(async () => {
  if (sql) await sql.end({ timeout: 5 });
  if (container) await container.stop();
});

describe("migrations apply cleanly from v1", () => {
  it("creates every expected public table", async () => {
    if (!sql) throw new Error("sql not initialised");
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name`;
    const names = rows.map((r) => r.table_name);
    for (const expected of EXPECTED_TABLES) {
      expect(names, `missing table ${expected}`).toContain(expected);
    }
  });

  it("records every migration in __migrations in filename order", async () => {
    if (!sql) throw new Error("sql not initialised");
    const rows = await sql<{ name: string }[]>`
      SELECT name FROM __migrations ORDER BY name ASC`;
    const names = rows.map((r) => r.name);
    expect(names.length).toBeGreaterThan(0);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
    expect(names[0]).toMatch(/^0000_/);
  });

  it("is idempotent on second run", async () => {
    const url = container!.getConnectionUri();
    const applied = await runMigrations(url);
    expect(applied).toEqual([]);
  });

  it("seeds a settings row through the live schema", async () => {
    if (!sql) throw new Error("sql not initialised");
    await sql`INSERT INTO settings (key, value) VALUES ('TEST_KEY', 'hello')`;
    const got = await sql<{ key: string; value: unknown }[]>`
      SELECT key, value FROM settings WHERE key = 'TEST_KEY'`;
    expect(got).toHaveLength(1);
    expect(got[0].value).toBe("hello");
  });
});
