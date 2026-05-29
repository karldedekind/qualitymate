import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import * as tar from "tar";
import postgres from "postgres";
import { SECRET_KEYS } from "@/lib/settings";

const APP_VERSION = process.env.npm_package_version || "0.0.0";

const REDACT_NAME_PATTERNS = [
  /SECRET/i,
  /TOKEN/i,
  /PASSWORD/i,
  /PASSPHRASE/i,
  /PASS$/i,
  /PRIVATE/i,
  /API[_-]?KEY/i,
  /KEY$/i,
];

export function sanitiseEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue;
    if (SECRET_KEYS.has(k.toLowerCase())) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (REDACT_NAME_PATTERNS.some((rx) => rx.test(k))) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function tailLines(content: string, max: number): string {
  const lines = content.split(/\r?\n/);
  if (lines.length <= max) return content;
  return lines.slice(lines.length - max).join("\n");
}

async function gatherPgStats(databaseUrl: string): Promise<Record<string, unknown>> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [database, tables, activity] = await Promise.all([
      sql`SELECT datname, numbackends, xact_commit, xact_rollback, blks_read, blks_hit, tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted, conflicts, deadlocks
          FROM pg_stat_database WHERE datname = current_database()`,
      sql`SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del, n_live_tup, n_dead_tup
          FROM pg_stat_user_tables ORDER BY relname`,
      sql`SELECT count(*)::int AS connection_count FROM pg_stat_activity WHERE datname = current_database()`,
    ]);
    return {
      pg_stat_database: database,
      pg_stat_user_tables: tables,
      pg_stat_activity_summary: activity[0] ?? null,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readLogTail(): Promise<string> {
  const candidate = process.env.LOG_FILE || "/app/data/logs/app.log";
  if (!existsSync(candidate)) {
    return `# No log file found at ${candidate}.\n# Set LOG_FILE to a path the container can read, or wire stdout to a file via your supervisor.\n`;
  }
  try {
    const content = await readFile(candidate, "utf-8");
    return tailLines(content, 5000);
  } catch (err) {
    return `# Failed to read ${candidate}: ${(err as Error).message}\n`;
  }
}

export type DiagnosticsManifest = {
  generatedAt: string;
  version: string;
  instanceId: string | null;
  files: string[];
};

export type DiagnosticsBundle = {
  stream: Readable;
  filename: string;
  manifest: DiagnosticsManifest;
  cleanup: () => Promise<void>;
};

export async function buildDiagnosticsBundle(opts: {
  databaseUrl: string;
  instanceId: string | null;
}): Promise<DiagnosticsBundle> {
  const stage = await mkdtemp(join(tmpdir(), "qm-diag-"));

  const appInfo = {
    version: APP_VERSION,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    instanceId: opts.instanceId,
    generatedAt: new Date().toISOString(),
  };
  await writeFile(join(stage, "app-info.json"), JSON.stringify(appInfo, null, 2));

  const sanitised = sanitiseEnv(process.env);
  await writeFile(
    join(stage, "env-sanitised.txt"),
    Object.entries(sanitised)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );

  let pgStats: Record<string, unknown>;
  try {
    pgStats = await gatherPgStats(opts.databaseUrl);
  } catch (err) {
    pgStats = { error: (err as Error).message };
  }
  await writeFile(join(stage, "pg-stats.json"), JSON.stringify(pgStats, null, 2));

  await writeFile(join(stage, "logs.txt"), await readLogTail());

  const files = ["app-info.json", "env-sanitised.txt", "pg-stats.json", "logs.txt"];
  const manifest: DiagnosticsManifest = {
    generatedAt: appInfo.generatedAt,
    version: APP_VERSION,
    instanceId: opts.instanceId,
    files,
  };
  await writeFile(join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));

  const stream = tar.c(
    { gzip: true, cwd: stage, portable: true },
    [...files, "manifest.json"],
  ) as unknown as Readable;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    stream,
    filename: `qualitymate-diagnostics-${stamp}.tar.gz`,
    manifest,
    cleanup: async () => {
      await rm(stage, { recursive: true, force: true });
    },
  };
}
